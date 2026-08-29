/**
 * Hands-free loop:
 * SPEAKING_FR → LISTENING (saisie incrémentale) → EVALUATING → FEEDBACK (audio) → CORRECTION
 * CORRECTION → NEXT → NEXT_PHRASE → SPEAKING_FR
 */

import { CONFIG, LOOP_STATES } from "./config.js";
import { tts } from "./tts.js";
import { stt } from "./stt.js";
import { detectCommand, stripCommands } from "./commands.js";
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
    this._onSpeechEnd = (ev) => this._handleSpeechEnd(ev.detail);
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
    stt.addEventListener("transcript", this._onTranscript);
    stt.addEventListener("speechend", this._onSpeechEnd);
    await tts.init();
    this._busy = true;
    try {
      if (!stt._listening) await stt.start();
      await this._speakCurrent();
    } finally {
      this._busy = false;
    }
  }

  async stop() {
    this.running = false;
    stt.removeEventListener("transcript", this._onTranscript);
    stt.removeEventListener("speechend", this._onSpeechEnd);
    tts.cancel();
    await stt.pause();
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

  _handleTranscript(detail) {
    if (!this.running) return;
    this._emit("transcript", { buffer: detail.buffer, partial: detail.partial });
  }

  async _handleSpeechEnd(detail) {
    if (!this.running || this._busy) return;
    if (this.state !== LOOP_STATES.LISTENING && this.state !== LOOP_STATES.CORRECTION) return;

    this._busy = true;
    await stt.pause();

    try {
      const spoken = String(detail?.buffer || stt.getBuffer() || "").trim();
      const phase = this._commandPhase();
      const command = detectCommand(spoken, { phase });

      if (command) {
        await this._dispatch(command, { phase });
        return;
      }

      if (this.state === LOOP_STATES.LISTENING && spoken) {
        const answer = stripCommands(spoken);
        const { ok } = isMatch(answer, queue.current()?.en || "", CONFIG.SIMILARITY_THRESHOLD, {
          wordThreshold: CONFIG.KEYWORD_WORD_THRESHOLD,
        });
        if (ok) {
          await this._finalizeAttempt(answer, { force: false });
          return;
        }
      }

      if (this.running) this._resumeMic();
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
    const spoken = stripCommands(spokenRaw);
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
      await tts.speakFr(phrase.fr);
      if (!this.running) return;
      await tts.speakEn(phrase.en);
      if (!this.running) return;
      await tts.speakEn("Perfect");
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
    const nextPhrase = queue.next();
    this.setState(LOOP_STATES.NEXT_PHRASE, { phrase: nextPhrase });
    await this._speakCurrent();
  }

  async _onRepeatFrench() {
    const phrase = queue.current();
    if (!phrase) return;
    await stt.pause();
    try {
      await tts.speakFr(phrase.fr);
    } catch {
      /* ignore */
    }
    if (!this.running) return;
    this.setState(LOOP_STATES.CORRECTION, { phrase });
    this._resumeMic();
  }

  async _onRepeatEnglish() {
    const phrase = queue.current();
    if (!phrase) return;
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

  /** Manual UI triggers — same semantics as voice commands. */
  async trigger(type, extra = {}) {
    if (!this.running) return;
    if (this._busy && type !== "REPEAT_FRENCH" && type !== "REPEAT_ENGLISH" && type !== "STOP") return;

    const spoken = extra.spoken || stt.getBuffer();
    const fake = { type, before: spoken, after: extra.note || "", raw: spoken };
    this._busy = true;
    try {
      await stt.pause();
      await this._dispatch(fake, { phase: this._commandPhase() });
    } finally {
      this._busy = false;
    }
  }
}

export const loop = new LoopManager();
