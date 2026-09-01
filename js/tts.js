/**
 * TTS: Web Speech API in browser, Android TextToSpeech in the native app.
 */

import { CONFIG } from "./config.js";
import { getNativeTts } from "./native-tts.js";

function synth() {
  try {
    return globalThis.speechSynthesis ?? null;
  } catch {
    return null;
  }
}

function pickVoice(lang) {
  const ss = synth();
  if (!ss) return null;
  const voices = ss.getVoices();
  const prefix = lang.toLowerCase().slice(0, 2);
  const exact = voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) || null;
}

function waitForVoices() {
  const ss = synth();
  if (!ss) return Promise.resolve();
  if (ss.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      ss.removeEventListener("voiceschanged", done);
      resolve();
    };
    ss.addEventListener("voiceschanged", done);
    ss.getVoices();
    setTimeout(done, 1500);
  });
}

export const tts = {
  _ready: null,
  _current: null,
  _native: null,

  get available() {
    return Boolean(this._native) || Boolean(synth());
  },

  async init() {
    const native = getNativeTts();
    if (native) {
      await native.init();
      this._native = native;
      return;
    }
    if (!this._ready) this._ready = waitForVoices();
    await this._ready;
  },

  async cancel() {
    this._current = null;
    if (this._native) await this._native.cancel();
    try {
      synth()?.cancel();
    } catch {
      /* ignore */
    }
  },

  /**
   * @param {string} text
   * @param {"fr-FR"|"en-US"|string} lang
   * @param {{ rate?: number, interrupt?: boolean }} [opts]
   */
  async speak(text, lang = CONFIG.TTS.fr, opts = {}) {
    const utteranceText = String(text || "").trim();
    if (!utteranceText) return;

    if (opts.interrupt !== false) await this.cancel();

    if (this._native) {
      const token = {};
      this._current = token;
      try {
        await this._native.speak(utteranceText, lang, { rate: opts.rate ?? CONFIG.TTS.rate });
      } finally {
        if (this._current === token) this._current = null;
      }
      return;
    }

    const ss = synth();
    if (!ss || typeof SpeechSynthesisUtterance === "undefined") return;

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

      ss.resume();
      ss.speak(u);
    });
  },

  speakFr(text, opts) {
    return this.speak(text, CONFIG.TTS.fr, opts);
  },

  speakEn(text, opts) {
    return this.speak(text, CONFIG.TTS.en, opts);
  },
};
