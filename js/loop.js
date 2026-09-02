/**
 * Hands-free loop (volant / validation manuelle):
 * SPEAKING_FR → LISTENING (micro ouvert) → [Next volant] → EVALUATING → FEEDBACK → CORRECTION
 * CORRECTION → commande vocale immédiate ou [Next volant seul] → NEXT_PHRASE → SPEAKING_FR
 * Previous volant en saisie : Repeat French · voix : Previous · correction : Remind + phrase suivante
 */

import { CONFIG, LOOP_STATES } from "./config.js";
import { tts } from "./tts.js";
import { stt } from "./stt.js";
import { wakeLock } from "./wake-lock.js";
import { detectCommand, detectCommandOnPhysicalNext, stripCommands } from "./commands.js";
import { isMatch } from "./fuzzy.js";
import { queue, applyAttempt } from "./queue.js";
import { storage } from "./storage.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LoopManager extends EventTarget {
  constructor() {
    super();
    this.state = LOOP_STATES.IDLE;
    this.running = false;
    this._busy = false;
    this._onTranscript = (ev) => this._handleTranscript(ev.detail);
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  setState(state, extra = {}) {
    this.state = state;
    this._emit("state", { state, phrase: queue.current(), ...extra });
  }

  _commandPhase() {
    return this.state === LOOP_STATES.CORRECTION ? "correction" : "listening";
  }

  async start() {
    if (this.running) return;
    this.running = true;
    stt.setManualValidation(true);
    stt.addEventListener("transcript", this._onTranscript);
    await wakeLock.acquire();
    await tts.init();
    this._busy = true;
    try {
      // The first microphone acquisition happens only after the French prompt.
      await this._speakCurrent();
    } finally {
      this._busy = false;
    }
  }

  async stop() {
    this.running = false;
    stt.setManualValidation(false);
    stt.removeEventListener("transcript", this._onTranscript);
    tts.cancel();
    await stt.stop();
    await wakeLock.release();
    this.setState(LOOP_STATES.IDLE);
    this._emit("session-stop");
  }

  currentPhrase() {
    return queue.current();
  }

  async _speakCurrent() {
    const phrase = queue.current();
    if (!phrase || !this.running) return;
    this._busy = true;
    this.setState(LOOP_STATES.SPEAKING_FR, { phrase });
    await stt.pause();
    stt.clearBuffer();
    try {
      await tts.speakFr(phrase.fr);
    } catch {
      /* TTS may be blocked; continue to listening */
    }
    if (!this.running) return;
    this.setState(LOOP_STATES.LISTENING, { phrase });
    this._resumeMic();
  }

  _resumeMic() {
    stt.resume().catch((err) => {
      this._emit("log", { level: "warn", message: String(err?.message || err) });
    });
  }

  /** Resume mic/STT after the page returns to the foreground. */
  resumeAfterBackground() {
    if (!this.running || this._busy) return;
    if (this.state !== LOOP_STATES.LISTENING && this.state !== LOOP_STATES.CORRECTION) return;
    this._resumeMic();
  }

  _handleTranscript(detail) {
    if (!this.running) return;
    this._emit("transcript", { buffer: detail.buffer, partial: detail.partial });

    if (this._busy || detail.partial || !detail.text) return;

    if (this.state === LOOP_STATES.LISTENING) {
      const command = detectCommand(detail.buffer, { phase: "listening" });
      if (command?.type !== "PREVIOUS") return;

      if (command.before) stt.setBuffer(command.before);
      else stt.clearBuffer();

      this._busy = true;
      this._onPrevious()
        .catch((err) => {
          this._emit("log", { level: "warn", message: String(err?.message || err) });
        })
        .finally(() => {
          this._busy = false;
        });
      return;
    }

    // CORRECTION: voice commands apply immediately (same as LISTENING "previous").
    // Physical Next without a trailing command still advances via onPhysicalNext().
    if (this.state === LOOP_STATES.CORRECTION) {
      const command = detectCommand(detail.buffer, { phase: "correction" });
      if (!command) return;

      stt.clearBuffer();
      this._busy = true;
      stt
        .pause()
        .then(() => this._dispatch(command, { phase: "correction" }))
        .catch((err) => {
          this._emit("log", { level: "warn", message: String(err?.message || err) });
        })
        .finally(() => {
          this._busy = false;
        });
    }
  }

  /**
   * Physical or UI Next — validates the answer (listening) or runs a voice command (correction).
   */
  async onPhysicalNext() {
    if (!this.running || this._busy) return;
    if (this.state !== LOOP_STATES.LISTENING && this.state !== LOOP_STATES.CORRECTION) return;

    this._busy = true;
    await stt.pause();
    stt.commitPartial();

    try {
      const spoken = stt.getBuffer().trim();

      if (this.state === LOOP_STATES.LISTENING) {
        await this._finalizeAttempt(spoken, { force: true });
        return;
      }

      const command = detectCommandOnPhysicalNext(spoken, { phase: "correction" });
      if (command) {
        await this._dispatch(command, { phase: "correction" });
        return;
      }

      await this._advanceFromCorrection();
    } finally {
      this._busy = false;
    }
  }

  /**
   * Physical or UI Previous — Repeat French while capturing; Remind + next in correction.
   */
  async onPhysicalPrevious() {
    if (!this.running || this._busy) return;
    if (this.state !== LOOP_STATES.LISTENING && this.state !== LOOP_STATES.CORRECTION) return;

    this._busy = true;
    await stt.pause();

    try {
      if (this.state === LOOP_STATES.LISTENING) {
        await this._onRepeatFrench();
        return;
      }

      stt.clearBuffer();
      const phrase = queue.current();
      if (phrase) {
        storage.addRemind(phrase.id, "");
        this._emit("remind", { phrase, note: "" });
      }
      await this._advanceFromCorrection();
    } finally {
      this._busy = false;
    }
  }

  async _dispatch(command, { phase } = {}) {
    if (command.type === "STOP") {
      await this.stop();
      return;
    }
    if (command.type === "REPEAT_FRENCH") await this._onRepeatFrench();
    else if (command.type === "REPEAT_ENGLISH") await this._onRepeatEnglish();
    else if (command.type === "NEXT") {
      if (phase === "correction" || this.state === LOOP_STATES.CORRECTION) {
        await this._advanceFromCorrection();
      } else {
        await this._finalizeAttempt(stripCommands(command.before || ""), { force: true });
      }
    } else if (command.type === "PREVIOUS") await this._onPrevious();
    else if (command.type === "REMIND") await this._onRemind(command);
    else if (command.type === "DONT_REMIND") await this._onDontRemind();
  }

  async _finalizeAttempt(spokenRaw, { force = false } = {}) {
    const phrase = queue.current();
    if (!phrase) return;

    this.setState(LOOP_STATES.EVALUATING, { phrase });
    const spoken = String(spokenRaw || "").trim();
    const { ok, score } = isMatch(spoken, phrase.en, CONFIG.SIMILARITY_THRESHOLD, {
      wordThreshold: CONFIG.KEYWORD_WORD_THRESHOLD,
    });

    applyAttempt(phrase.id, ok);
    await storage.logAttempt({
      phraseId: phrase.id,
      spoken,
      expected: phrase.en,
      score,
      ok,
      via: force ? "next" : "auto",
    });

    this.setState(LOOP_STATES.FEEDBACK, { phrase, ok, score, spoken, force });
    this._emit("feedback", { phrase, ok, score, spoken, force, phase: "validated" });

    await sleep(CONFIG.POST_VALIDATION_PAUSE_MS);
    if (!this.running) return;

    try {
      if (ok) {
        await tts.speakEn("Perfect");
      } else {
        await tts.speakEn(phrase.en);
      }
    } catch {
      /* TTS blocked */
    }

    if (!this.running) return;
    stt.clearBuffer();
    this.setState(LOOP_STATES.CORRECTION, { phrase, ok, score, spoken });
    this._emit("correction", { phrase, ok, score, spoken });
    this._resumeMic();
  }

  async _advanceFromCorrection() {
    stt.clearBuffer();
    const nextPhrase = queue.next();
    this.setState(LOOP_STATES.NEXT_PHRASE, { phrase: nextPhrase });
    await this._speakCurrent();
  }

  async _onRepeatFrench() {
    const phrase = queue.current();
    if (!phrase) return;
    const returnState =
      this.state === LOOP_STATES.CORRECTION ? LOOP_STATES.CORRECTION : LOOP_STATES.LISTENING;
    stt.clearBuffer();
    await stt.pause();
    try {
      await tts.speakFr(phrase.fr);
    } catch {
      /* ignore */
    }
    if (!this.running) return;
    this.setState(returnState, { phrase });
    this._resumeMic();
  }

  async _onRepeatEnglish() {
    const phrase = queue.current();
    if (!phrase) return;
    stt.clearBuffer();
    await stt.pause();
    try {
      await tts.speakEn(phrase.en);
    } catch {
      /* ignore */
    }
    if (!this.running) return;
    this.setState(LOOP_STATES.CORRECTION, { phrase });
    this._resumeMic();
  }

  async _onPrevious() {
    await stt.pause();
    stt.clearBuffer();
    const phrase = queue.previous();
    this.setState(LOOP_STATES.NEXT_PHRASE, { phrase });
    await this._speakCurrent();
  }

  async _onRemind(command) {
    const phrase = queue.current();
    if (!phrase) return;
    const note = (command.after || "").trim();
    storage.addRemind(phrase.id, note);
    this._emit("remind", { phrase, note });
    await this._advanceFromCorrection();
  }

  async _onDontRemind() {
    const phrase = queue.current();
    if (!phrase) return;
    storage.removeRemind(phrase.id);
    this._emit("dont-remind", { phrase });
    await this._advanceFromCorrection();
  }

  /** Manual UI triggers — correction shortcuts or same semantics as physical keys. */
  async trigger(type, extra = {}) {
    if (!this.running) return;

    if (type === "NEXT") {
      await this.onPhysicalNext();
      return;
    }
    if (type === "PREVIOUS") {
      await this.onPhysicalPrevious();
      return;
    }
    if (type === "STOP") {
      await this.stop();
      return;
    }

    if (this._busy) return;
    this._busy = true;
    try {
      await stt.pause();
      stt.commitPartial();
      const spoken = extra.spoken ?? stt.getBuffer();
      const fake = { type, before: spoken, after: extra.note || "", raw: spoken };
      await this._dispatch(fake, { phase: this._commandPhase() });
    } finally {
      this._busy = false;
    }
  }
}

export const loop = new LoopManager();
