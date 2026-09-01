/**
 * Short media-channel beeps when the microphone opens or closes.
 * Routed like TTS — audible on car Bluetooth unlike Android system mic sounds.
 */

import { CONFIG } from "./config.js";
import { storage } from "./storage.js";

export class AudioCues {
  constructor() {
    this._ctx = null;
  }

  async _context() {
    if (!this._ctx || this._ctx.state === "closed") {
      this._ctx = new AudioContext();
    }
    if (this._ctx.state === "suspended") await this._ctx.resume();
    return this._ctx;
  }

  /** @param {"micOn"|"micOff"} kind */
  async play(kind) {
    if (!storage.getSettings().micCues) return;
    try {
      const ctx = await this._context();
      const { micOn, micOff } = CONFIG.AUDIO_CUES;
      const spec = kind === "micOn" ? micOn : micOff;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(spec.startHz, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(spec.endHz, ctx.currentTime + spec.durationMs / 1000);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(spec.volume, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + spec.durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + spec.durationMs / 1000 + 0.02);
    } catch {
      /* Audio blocked or unavailable — non-fatal. */
    }
  }

  micOn() {
    return this.play("micOn");
  }

  micOff() {
    return this.play("micOff");
  }
}

export const audioCues = new AudioCues();
