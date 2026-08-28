/**
 * Hands-free loop state machine:
 * SPEAKING_FR → LISTENING → EVALUATING → FEEDBACK → AWAITING_CONFIRM
 * (OK / OK MONKEY) → NEXT_PHRASE → SPEAKING_FR
 */

import { CONFIG, LOOP_STATES } from "./config.js";
import { tts } from "./tts.js";
import { stt } from "./stt.js";
import { detectCommand, stripCommands } from "./commands.js";
import { isMatch } from "./fuzzy.js";
import { queue, applyAttempt } from "./queue.js";
import { storage } from "./storage.js";

export class LoopManager extends EventTarget {
  constructor() {
    super();
    this.state = LOOP_STATES.IDLE;
    this.running = false;
    this._busy = false;
    this._awaitingAdvance = false;
    this._onTranscript = (ev) => this._handleTranscript(ev.detail);
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  setState(state, extra = {}) {
    this.state = state;
    this._emit("state", { state, phrase: queue.current(), ...extra });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this._awaitingAdvance = false;
    stt.addEventListener("transcript", this._onTranscript);
    await tts.init();
    if (!stt._listening) await stt.start();
    await this._speakCurrent();
  }

  async stop() {
    this.running = false;
    this._awaitingAdvance = false;
    stt.removeEventListener("transcript", this._onTranscript);
    tts.cancel();
    await stt.pause();
    this.setState(LOOP_STATES.IDLE);
  }

  currentPhrase() {
    return queue.current();
  }

  async _speakCurrent({ resumeConfirm = false } = {}) {
    const phrase = queue.current();
    if (!phrase || !this.running) return;
    this._busy = true;
    if (!resumeConfirm) this._awaitingAdvance = false;
    this.setState(LOOP_STATES.SPEAKING_FR, { phrase });
    await stt.pause();
    stt.clearBuffer();
    try {
      await tts.speakFr(phrase.fr);
    } catch {
      /* TTS may be blocked; continue to listening */
    }
    if (!this.running) {
      this._busy = false;
      return;
    }
    const nextState = resumeConfirm ? LOOP_STATES.AWAITING_CONFIRM : LOOP_STATES.LISTENING;
    if (resumeConfirm) this._awaitingAdvance = true;
    this.setState(nextState, { phrase });
    await stt.resume();
    this._busy = false;
  }

  _canListen() {
    return this.state === LOOP_STATES.LISTENING || this.state === LOOP_STATES.AWAITING_CONFIRM;
  }

  async _handleTranscript(detail) {
    if (!this.running || this._busy) return;
    if (!this._canListen()) return;

    const probe = `${detail.buffer || ""} ${detail.partial || ""}`.trim();
    this._emit("transcript", { buffer: detail.buffer, partial: detail.partial });

    const command = detectCommand(probe, { allowBareOk: this._awaitingAdvance });
    if (!command) return;

    this._busy = true;
    stt.clearBuffer();

    try {
      if (command.type === "REPEAT") await this._onRepeat();
      else if (command.type === "OK") await this._onOk(command);
      else if (command.type === "PREVIOUS") await this._onPrevious();
      else if (command.type === "NEXT") await this._onNext();
      else if (command.type === "REMIND") await this._onRemind(command);
    } finally {
      this._busy = false;
    }
  }

  async _onRepeat() {
    await stt.pause();
    await this._speakCurrent({ resumeConfirm: this._awaitingAdvance });
  }

  async _onOk(command) {
    if (this._awaitingAdvance) {
      await this._advance();
      return;
    }

    const phrase = queue.current();
    if (!phrase) return;
    this.setState(LOOP_STATES.EVALUATING, { phrase });
    await stt.pause();

    const spoken = stripCommands(command.before || command.raw);
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
      via: "ok-monkey",
    });

    this.setState(LOOP_STATES.FEEDBACK, { phrase, ok, score, spoken });
    this._emit("feedback", { phrase, ok, score, spoken });

    if (ok) {
      await tts.speakEn("Perfect");
    } else {
      await tts.speakEn(`Incorrect. The correct answer is: ${phrase.en}`);
    }

    if (!this.running) return;
    this._awaitingAdvance = true;
    stt.clearBuffer();
    this.setState(LOOP_STATES.AWAITING_CONFIRM, { phrase, ok, score, spoken });
    await stt.resume();
  }

  async _advance() {
    this._awaitingAdvance = false;
    const nextPhrase = queue.next();
    this.setState(LOOP_STATES.NEXT_PHRASE, { phrase: nextPhrase });
    await this._speakCurrent();
  }

  async _onPrevious() {
    this._awaitingAdvance = false;
    await stt.pause();
    const phrase = queue.previous();
    this.setState(LOOP_STATES.NEXT_PHRASE, { phrase });
    await this._speakCurrent();
  }

  async _onNext() {
    this._awaitingAdvance = false;
    await stt.pause();
    const phrase = queue.next();
    this.setState(LOOP_STATES.NEXT_PHRASE, { phrase });
    await this._speakCurrent();
  }

  async _onRemind(command) {
    const phrase = queue.current();
    if (!phrase) return;
    const note = (command.after || "").trim();
    storage.addRemind(phrase.id, note);
    this._emit("remind", { phrase, note });
    await stt.pause();
    await tts.speakEn("Added to review");
    if (!this.running) return;
    const nextState = this._awaitingAdvance ? LOOP_STATES.AWAITING_CONFIRM : LOOP_STATES.LISTENING;
    stt.clearBuffer();
    this.setState(nextState, { phrase });
    await stt.resume();
  }

  /** Manual UI triggers — same semantics as voice commands. */
  async trigger(type, extra = {}) {
    if (this._busy && type !== "REPEAT") return;
    const fake = { type, before: extra.spoken || stt.getBuffer(), after: extra.note || "", raw: "" };
    this._busy = true;
    try {
      if (type === "REPEAT") await this._onRepeat();
      else if (type === "OK") await this._onOk(fake);
      else if (type === "PREVIOUS") await this._onPrevious();
      else if (type === "NEXT") await this._onNext();
      else if (type === "REMIND") await this._onRemind(fake);
    } finally {
      this._busy = false;
    }
  }
}

export const loop = new LoopManager();
