/**
 * Offline-first STT: Vosk WASM → Whisper WASM → Web Speech API fallback
 * while models load. Emits partial/final transcripts into a rolling buffer.
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

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.({ loaded: received, total, ratio: received / total });
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
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
    this._fallbackActive = false;
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
    this._emit("transcript", { text: "", partial: "", buffer: "" });
  }

  appendTranscript(text, { replacePartial = false } = {}) {
    const chunk = String(text || "").trim();
    if (!chunk) return;
    if (replacePartial) {
      this._emit("transcript", { text: "", partial: chunk, buffer: `${this.buffer} ${chunk}`.trim() });
      return;
    }
    this.buffer = `${this.buffer} ${chunk}`.trim();
    this._emit("transcript", { text: chunk, partial: "", buffer: this.buffer });
  }

  async init() {
    this.setStatus("loading-wasm", { message: "Chargement du moteur vocal…" });
    this._startWebSpeechFallback();

    try {
      await this._initVosk();
      this.engine = "vosk";
      this._stopWebSpeechFallback();
      this.setStatus("ready", { message: "Vosk WASM prêt (hors-ligne)" });
      return;
    } catch (err) {
      this._emit("log", { level: "warn", message: `Vosk indisponible: ${err.message}` });
    }

    try {
      await this._initWhisper();
      this.engine = "whisper";
      this._stopWebSpeechFallback();
      this.setStatus("ready", { message: "Whisper WASM prêt (hors-ligne)" });
      return;
    } catch (err) {
      this._emit("log", { level: "warn", message: `Whisper indisponible: ${err.message}` });
    }

    this.engine = this._recognition ? "webspeech" : "none";
    this.setStatus(this.engine === "webspeech" ? "fallback" : "error", {
      message:
        this.engine === "webspeech"
          ? "WASM en échec — Web Speech API en secours"
          : "Aucun moteur STT disponible",
    });
  }

  _startWebSpeechFallback() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      if (this._paused || !this._listening) return;
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
      if (this._listening && !this._paused && this.engine === "webspeech") {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    this._recognition = rec;
    this._fallbackActive = true;
    this.engine = "webspeech";
    this.setStatus("fallback", { message: "Écoute Web Speech pendant le chargement WASM…" });
  }

  _stopWebSpeechFallback() {
    this._fallbackActive = false;
    if (this._recognition && this.engine !== "webspeech") {
      try {
        this._recognition.stop();
      } catch {
        /* ignore */
      }
    }
  }

  async _initVosk() {
    this.setStatus("loading-wasm", { message: "Téléchargement du modèle Vosk…" });
    const { createModel } = await import(/* @vite-ignore */ CONFIG.STT.voskCdn);
    let lastError = null;
    for (const url of CONFIG.STT.voskModelUrls) {
      try {
        this.setStatus("loading-wasm", { message: `Modèle Vosk: ${url.split("/").pop()}` });
        const model = await createModel(url);
        this._vosk = { model, url };
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("Aucun modèle Vosk chargé");
  }

  async _initWhisper() {
    this.setStatus("loading-wasm", { message: "Chargement de Whisper tiny.en…" });
    const { pipeline, env } = await import(/* @vite-ignore */ `${CONFIG.STT.transformersCdn}`);
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = `${CONFIG.STT.transformersCdn}/dist/`;
    }
    this._whisper = await pipeline("automatic-speech-recognition", CONFIG.STT.whisperModel, {
      progress_callback: (p) => {
        const ratio = p?.progress != null ? p.progress / 100 : p?.status === "done" ? 1 : 0;
        this.setStatus("loading-wasm", {
          message: p?.file ? `Whisper: ${p.status || ""} ${p.file}` : "Whisper…",
          ratio,
        });
      },
    });
  }

  async start() {
    if (this._listening) return;
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    this._listening = true;
    this._paused = false;

    if (this.engine === "vosk" && this._vosk) {
      await this._startVoskCapture();
    } else if (this.engine === "whisper" && this._whisper) {
      await this._startWhisperCapture();
    } else if (this._recognition) {
      this.engine = "webspeech";
      try {
        this._recognition.start();
      } catch {
        /* already started */
      }
    } else {
      throw new Error("STT non initialisé");
    }
    this._emit("listening", { listening: true });
  }

  async pause() {
    this._paused = true;
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
      try {
        this._recognition.start();
      } catch {
        /* already started */
      }
    }
  }

  async stop() {
    this._listening = false;
    this._paused = true;
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
      this.appendTranscript(text);
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
      if (text && !this._paused) this.appendTranscript(text);
    } catch (err) {
      this._emit("log", { level: "warn", message: `Whisper: ${err.message}` });
    } finally {
      this._whisperBusy = false;
    }
  }
}

export const stt = new STTService();
