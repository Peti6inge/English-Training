/**
 * TTS wrapper around speechSynthesis.
 * French (fr-FR) for prompts, English (en-US) for answers and feedback.
 */

import { CONFIG } from "./config.js";

function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const prefix = lang.toLowerCase().slice(0, 2);
  const exact = voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) || null;
}

function waitForVoices() {
  if (speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    };
    speechSynthesis.addEventListener("voiceschanged", done);
    speechSynthesis.getVoices();
    setTimeout(done, 1500);
  });
}

export const tts = {
  _ready: null,
  _current: null,

  async init() {
    if (!this._ready) this._ready = waitForVoices();
    await this._ready;
  },

  cancel() {
    this._current = null;
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  },

  /**
   * @param {string} text
   * @param {"fr-FR"|"en-US"|string} lang
   * @param {{ rate?: number, interrupt?: boolean }} [opts]
   */
  speak(text, lang = CONFIG.TTS.fr, opts = {}) {
    const utteranceText = String(text || "").trim();
    if (!utteranceText) return Promise.resolve();
    if (!("speechSynthesis" in window)) return Promise.resolve();

    if (opts.interrupt !== false) this.cancel();

    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(utteranceText);
      u.lang = lang;
      u.rate = opts.rate ?? CONFIG.TTS.rate;
      u.pitch = CONFIG.TTS.pitch;
      const voice = pickVoice(lang);
      if (voice) u.voice = voice;

      const token = {};
      this._current = token;

      u.onend = () => {
        if (this._current === token) this._current = null;
        resolve();
      };
      u.onerror = (ev) => {
        if (this._current === token) this._current = null;
        if (ev.error === "canceled" || ev.error === "interrupted") resolve();
        else reject(ev.error);
      };

      speechSynthesis.resume();
      speechSynthesis.speak(u);
    });
  },

  speakFr(text, opts) {
    return this.speak(text, CONFIG.TTS.fr, opts);
  },

  speakEn(text, opts) {
    return this.speak(text, CONFIG.TTS.en, opts);
  },
};
