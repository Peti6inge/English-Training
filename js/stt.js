/**
 * Offline-first STT:
 * Mobile/Android: keep the native Web Speech recognizer (Chrome uses Android STT).
 * Desktop: Vosk WASM → Whisper WASM, with Web Speech as a fast fallback.
 */

import { CONFIG } from "./config.js";

function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.round(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = pos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} — délai dépassé (${Math.round(ms / 1000)}s)`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

export class STTService extends EventTarget {
  constructor() {
    super();
    this.engine = "none";
    this.status = "idle";
    this.buffer = "";
    this._listening = false;
    this._paused = false;
    this._stream = null;
    this._audioContext = null;
    this._processor = null;
    this._source = null;
    this._vosk = null;
    this._whisper = null;
    this._pcmChunks = [];
    this._pcmSamples = 0;
    this._whisperBusy = false;
    this._recognition = null;
    this._wasmTask = null;
    this._restartTimer = null;
    this._silenceTimer = null;
    this._lastPartial = "";
    this._mediaSampleRate = CONFIG.STT.sampleRate;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  setStatus(status, extra = {}) {
    this.status = status;
    this._emit("status", { status, engine: this.engine, ...extra });
  }

  getBuffer() {
    return this.buffer;
  }

  clearBuffer() {
    this.buffer = "";
    this._lastPartial = "";
    this._emit("transcript", { text: "", partial: "", buffer: "" });
  }

  appendTranscript(text, { replacePartial = false } = {}) {
    const chunk = String(text || "").trim();
    if (!chunk) return;
    if (replacePartial) {
      this._lastPartial = chunk;
      this._emit("transcript", { text: "", partial: chunk, buffer: `${this.buffer} ${chunk}`.trim() });
      return;
    }
    this._lastPartial = "";
    this.buffer = `${this.buffer} ${chunk}`.trim();
    this._emit("transcript", { text: chunk, partial: "", buffer: this.buffer });
  }

  _commitPartial() {
    if (!this._lastPartial) return;
    const chunk = this._lastPartial;
    this._lastPartial = "";
    this.buffer = `${this.buffer} ${chunk}`.trim();
    this._emit("transcript", { text: chunk, partial: "", buffer: this.buffer });
  }

  _emitSpeechEnd() {
    this._commitPartial();
    this._emit("speechend", { buffer: this.buffer });
  }

  /**
   * Fast init: on phone, pin the native recognizer (Chrome Android = Speech-to-Text système).
   * Whisper/Vosk WASM is skipped when native STT is available — it was degrading mobile quality.
   */
  async init() {
    this._startWebSpeechFallback();

    const mobile = isMobileDevice();
    const android = isAndroidDevice();

    if (this._recognition && mobile) {
      this.engine = "webspeech";
      this.setStatus("fallback", {
        message: android
          ? "STT natif Android (Speech-to-Text système)"
          : "STT natif (Web Speech) — WASM désactivé sur mobile",
      });
      this._emit("log", {
        level: "info",
        message: android
          ? "Moteur STT: webspeech (natif Android). Whisper ignoré pour la qualité."
          : "Moteur STT: webspeech (natif). Whisper ignoré sur mobile.",
      });
      return;
    }

    if (this._recognition) {
      this.engine = "webspeech";
      this.setStatus("fallback", { message: "Web Speech actif — WASM se charge en arrière-plan" });
    } else {
      this.setStatus("loading-wasm", { message: "Chargement WASM (sans secours Web Speech)…" });
    }

    this._wasmTask = this._loadWasmEngines();
    await Promise.race([
      this._wasmTask.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    if (this.engine === "none" && !this._recognition) {
      try {
        await withTimeout(this._wasmTask, CONFIG.STT.wasmTimeoutMs, "STT WASM");
      } catch (err) {
        this._emit("log", { level: "warn", message: err.message });
        this.setStatus("error", { message: "Aucun moteur STT disponible" });
      }
    }
  }

  async _loadWasmEngines() {
    const mobile = isMobileDevice();

    if (!mobile) {
      try {
        await withTimeout(this._initVosk(), CONFIG.STT.wasmTimeoutMs, "Vosk");
        await this._switchEngine("vosk", "Vosk WASM prêt (hors-ligne)");
        return;
      } catch (err) {
        this._emit("log", { level: "warn", message: `Vosk indisponible: ${err.message}` });
      }
    } else {
      this._emit("log", {
        level: "info",
        message: "Vosk ignoré sur mobile (souvent bloquant) — Whisper en arrière-plan",
      });
    }

    try {
      await withTimeout(this._initWhisper(), CONFIG.STT.wasmTimeoutMs, "Whisper");
      await this._switchEngine("whisper", "Whisper WASM prêt (hors-ligne)");
      return;
    } catch (err) {
      this._emit("log", { level: "warn", message: `Whisper indisponible: ${err.message}` });
    }

    if (this._recognition) {
      this.engine = "webspeech";
      this.setStatus("fallback", { message: "WASM indisponible — Web Speech API" });
    }
  }

  async _switchEngine(nextEngine, message) {
    if (this.engine === nextEngine) {
      this.setStatus("ready", { message });
      return;
    }

    const wasListening = this._listening && !this._paused;

    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch {
        /* ignore */
      }
    }

    this.engine = nextEngine;
    this.setStatus("ready", { message });
    this._emit("log", { level: "info", message: `Moteur STT: ${nextEngine}` });

    if (wasListening) {
      if (nextEngine === "vosk" || nextEngine === "whisper") {
        await this._ensureStream();
      }
      await this._restartCapture();
    }
  }

  async _restartCapture() {
    if (this._processor) {
      try {
        this._processor.disconnect();
      } catch {
        /* ignore */
      }
      this._processor = null;
    }
    if (this._source) {
      try {
        this._source.disconnect();
      } catch {
        /* ignore */
      }
      this._source = null;
    }
    if (this._audioContext) {
      try {
        await this._audioContext.close();
      } catch {
        /* ignore */
      }
      this._audioContext = null;
    }

    if (this.engine === "vosk" && this._vosk) {
      await this._startVoskCapture();
    } else if (this.engine === "whisper" && this._whisper) {
      await this._startWhisperCapture();
    } else if (this._recognition) {
      try {
        this._recognition.start();
      } catch {
        /* already started */
      }
    }
  }

  _startWebSpeechFallback() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = CONFIG.STT.lang || "en-US";
    // One-shot: the recognizer closes after an utterance, which drives auto-check.
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      if (this._paused || !this._listening || this.engine !== "webspeech") return;
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const alt = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += ` ${alt}`;
        else interim += ` ${alt}`;
      }
      if (finalText.trim()) this.appendTranscript(finalText);
      else if (interim.trim()) this.appendTranscript(interim, { replacePartial: true });
    };
    rec.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      this._emit("log", { level: "warn", message: `Web Speech: ${ev.error}` });
    };
    rec.onend = () => {
      if (!this._listening || this._paused || this.engine !== "webspeech") return;
      this._emitSpeechEnd();
    };
    this._recognition = rec;
  }

  _clearRestartTimer() {
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
  }

  _clearSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  _armUtteranceSilence(ms = CONFIG.STT.utteranceSilenceMs) {
    this._clearSilenceTimer();
    this._silenceTimer = setTimeout(() => {
      this._silenceTimer = null;
      if (!this._listening || this._paused) return;
      this._emitSpeechEnd();
    }, ms);
  }

  _scheduleNativeRestart() {
    this._clearRestartTimer();
    const delay = isAndroidDevice() ? CONFIG.STT.nativeRestartMs : 80;
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;
      if (!this._listening || this._paused || this.engine !== "webspeech" || !this._recognition) return;
      try {
        this._recognition.start();
      } catch {
        /* already started */
      }
    }, delay);
  }

  async _initVosk() {
    this.setStatus("loading-wasm", { message: "Téléchargement Vosk…", ratio: 0 });
    const { createModel } = await import(/* @vite-ignore */ CONFIG.STT.voskCdn);
    let lastError = null;
    for (const url of CONFIG.STT.voskModelUrls) {
      const name = url.split("/").pop();
      try {
        this.setStatus("loading-wasm", { message: `Vosk: ${name}`, ratio: 0 });
        const model = await createModel(url);
        this._vosk = { model, url };
        return;
      } catch (err) {
        lastError = err;
        this._emit("log", { level: "warn", message: `Vosk ${name}: ${err.message}` });
      }
    }
    throw lastError || new Error("Aucun modèle Vosk chargé");
  }

  async _initWhisper() {
    this.setStatus("loading-wasm", { message: "Chargement Whisper tiny.en…", ratio: 0 });
    const { pipeline, env } = await import(/* @vite-ignore */ `${CONFIG.STT.transformersCdn}`);
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = `${CONFIG.STT.transformersCdn}/dist/`;
    }
    this._whisper = await pipeline("automatic-speech-recognition", CONFIG.STT.whisperModel, {
      progress_callback: (p) => {
        const ratio = p?.progress != null ? p.progress / 100 : p?.status === "done" ? 1 : undefined;
        this.setStatus("loading-wasm", {
          message: p?.file ? `Whisper: ${p.status || ""} ${p.file}` : "Whisper…",
          ratio,
        });
      },
    });
  }

  async _ensureStream() {
    if (this._stream) return;
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  }

  async start() {
    if (this._listening) return;
    this._listening = true;
    this._paused = false;

    if (this.engine === "vosk" && this._vosk) {
      await this._ensureStream();
      await this._startVoskCapture();
    } else if (this.engine === "whisper" && this._whisper) {
      await this._ensureStream();
      await this._startWhisperCapture();
    } else if (this._recognition) {
      this.engine = "webspeech";
      try {
        this._recognition.start();
      } catch {
        /* already started */
      }
    } else {
      this._listening = false;
      throw new Error("STT non initialisé");
    }
    this._emit("listening", { listening: true });
  }

  async pause() {
    this._paused = true;
    this._clearRestartTimer();
    this._clearSilenceTimer();
    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch {
        /* ignore */
      }
    }
  }

  async resume() {
    this._paused = false;
    if (!this._listening) {
      await this.start();
      return;
    }
    if (this.engine === "webspeech" && this._recognition) {
      this._scheduleNativeRestart();
      return;
    }
    if ((this.engine === "vosk" && this._vosk) || (this.engine === "whisper" && this._whisper)) {
      if (!this._processor) {
        await this._ensureStream();
        if (this.engine === "vosk") await this._startVoskCapture();
        else await this._startWhisperCapture();
      }
    }
  }

  async stop() {
    this._listening = false;
    this._paused = true;
    this._clearRestartTimer();
    this._clearSilenceTimer();
    if (this._recognition) {
      try {
        this._recognition.stop();
      } catch {
        /* ignore */
      }
    }
    if (this._processor) {
      try {
        this._processor.disconnect();
      } catch {
        /* ignore */
      }
      this._processor = null;
    }
    if (this._source) {
      try {
        this._source.disconnect();
      } catch {
        /* ignore */
      }
      this._source = null;
    }
    if (this._audioContext) {
      try {
        await this._audioContext.close();
      } catch {
        /* ignore */
      }
      this._audioContext = null;
    }
    if (this._stream) {
      for (const track of this._stream.getTracks()) track.stop();
      this._stream = null;
    }
    this._pcmChunks = [];
    this._pcmSamples = 0;
    this._emit("listening", { listening: false });
  }

  async _startVoskCapture() {
    const ctx = new AudioContext();
    this._audioContext = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    this._mediaSampleRate = ctx.sampleRate;
    const recognizer = new this._vosk.model.KaldiRecognizer(ctx.sampleRate);
    if (typeof recognizer.setWords === "function") recognizer.setWords(true);

    recognizer.on("result", (message) => {
      if (this._paused) return;
      const text = message?.result?.text || "";
      if (text) {
        this.appendTranscript(text);
        this._armUtteranceSilence(700);
      }
    });
    recognizer.on("partialresult", (message) => {
      if (this._paused) return;
      const text = message?.result?.partial || "";
      this.appendTranscript(text, { replacePartial: true });
    });

    this._source = ctx.createMediaStreamSource(this._stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (this._paused || !this._listening) return;
      try {
        recognizer.acceptWaveform(event.inputBuffer);
      } catch (err) {
        this._emit("log", { level: "warn", message: String(err) });
      }
    };
    this._processor = processor;
    this._source.connect(processor);
    processor.connect(ctx.destination);
    this._vosk.recognizer = recognizer;
  }

  async _startWhisperCapture() {
    const ctx = new AudioContext();
    this._audioContext = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    this._mediaSampleRate = ctx.sampleRate;
    this._source = ctx.createMediaStreamSource(this._stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (this._paused || !this._listening) return;
      const data = event.inputBuffer.getChannelData(0);
      this._pcmChunks.push(new Float32Array(data));
      this._pcmSamples += data.length;
      const target = Math.round((CONFIG.STT.chunkMs / 1000) * ctx.sampleRate);
      if (this._pcmSamples >= target) this._flushWhisper();
    };
    this._processor = processor;
    this._source.connect(processor);
    processor.connect(ctx.destination);
  }

  async _flushWhisper() {
    if (this._whisperBusy || !this._pcmChunks.length) return;
    this._whisperBusy = true;
    const overlap = Math.round((CONFIG.STT.overlapMs / 1000) * this._mediaSampleRate);
    const merged = new Float32Array(this._pcmSamples);
    let offset = 0;
    for (const chunk of this._pcmChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const keepFrom = Math.max(0, merged.length - overlap);
    this._pcmChunks = keepFrom < merged.length ? [merged.slice(keepFrom)] : [];
    this._pcmSamples = this._pcmChunks[0]?.length || 0;

    try {
      const audio16k = resample(merged, this._mediaSampleRate, 16000);
      const result = await this._whisper(audio16k, {
        sampling_rate: 16000,
        chunk_length_s: 15,
        return_timestamps: false,
      });
      const text = (result?.text || "").trim();
      if (text && !this._paused) {
        this.appendTranscript(text);
        this._armUtteranceSilence();
      }
    } catch (err) {
      this._emit("log", { level: "warn", message: `Whisper: ${err.message}` });
    } finally {
      this._whisperBusy = false;
    }
  }
}

export const stt = new STTService();
