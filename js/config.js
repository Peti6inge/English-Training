/** Application-wide constants. Tune matching, engines, and storage here. */

export const CONFIG = {
  APP_NAME: "English Training",
  STORAGE_PREFIX: "english-training",
  IDB_NAME: "english-training",
  IDB_VERSION: 1,

  /** Fuzzy matcher: answers at or above this score are marked correct. */
  SIMILARITY_THRESHOLD: 0.85,

  TTS: {
    fr: "fr-FR",
    en: "en-US",
    rate: 0.95,
    pitch: 1,
  },

  STT: {
    sampleRate: 16000,
    /** Whisper chunk length while continuously listening. */
    chunkMs: 2500,
    overlapMs: 400,
    /** Abandon Vosk/Whisper load after this (ms) and keep Web Speech. */
    wasmTimeoutMs: 90_000,
    whisperModel: "Xenova/whisper-tiny.en",
    transformersCdn: "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",
    voskCdn: "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/+esm",
    voskModelUrls: [
      "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz",
      "https://huggingface.co/ccoreilly/vosk-model-small-en-us-0.15/resolve/main/model.tar.gz",
    ],
  },

  COMMANDS: {
    wake: "monkey",
    aliases: {
      ok: [/\b(ok|okay|okey|o\.k\.)\s+(monkey|monky|munkie)\b/i],
      repeat: [/\b(repeat|again)\s+(monkey|monky|munkie)\b/i],
      previous: [/\b(previous|back|last)\s+(monkey|monky|munkie)\b/i],
      next: [/\b(next|skip)\s+(monkey|monky|munkie)\b/i],
      remind: [/\b(remind|remember)\s+(monkey|monky|munkie)\b/i],
    },
  },

  SM2: {
    minInterval: 1,
    maxInterval: 30,
    easyBonus: 2.2,
  },
};

export const LOOP_STATES = Object.freeze({
  IDLE: "IDLE",
  SPEAKING_FR: "SPEAKING_FR",
  LISTENING: "LISTENING",
  EVALUATING: "EVALUATING",
  FEEDBACK: "FEEDBACK",
  NEXT_PHRASE: "NEXT_PHRASE",
});
