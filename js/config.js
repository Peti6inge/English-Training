/** Application-wide constants. Tune matching, engines, and storage here. */

export const CONFIG = {
  APP_NAME: "English Training",
  STORAGE_PREFIX: "english-training",
  IDB_NAME: "english-training",
  IDB_VERSION: 1,

  /** Fallback fuzzy matcher when keyword-in-order matching does not pass. */
  SIMILARITY_THRESHOLD: 0.85,
  /** Per-token similarity used when scanning expected keywords in order. */
  KEYWORD_WORD_THRESHOLD: 0.72,
  /** Insert a random Remind phrase after this many regular advances. */
  REMIND_INSERT_EVERY: 4,
  /** Pause (ms) before the post-validation audio sequence. */
  POST_VALIDATION_PAUSE_MS: 600,

  TTS: {
    fr: "fr-FR",
    en: "en-US",
    rate: 0.95,
    pitch: 1,
  },

  STT: {
    lang: "en-US",
    sampleRate: 16000,
    chunkMs: 2500,
    overlapMs: 400,
    nativeRestartMs: 250,
    utteranceSilenceMs: 1400,
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
    /** Available while the user is building an answer (incremental input). */
    listening: ["NEXT", "REPEAT_ENGLISH", "STOP"],
    /** Available after validation — correction / navigation phase. */
    correction: [
      "REPEAT_FRENCH",
      "REPEAT_ENGLISH",
      "NEXT",
      "PREVIOUS",
      "REMIND",
      "DONT_REMIND",
      "STOP",
    ],
    aliases: {
      stop: [/\bstop\b/i],
      dont_remind: [/\b(don't|dont|do not)\s+remind\b/i],
      repeat_english: [/\brepeat(?:\s+the)?\s+english\b/i],
      repeat_french: [/\brepeat(?:\s+the)?\s+french\b/i],
      previous: [/\bprevious\b/i],
      next: [/\bnext\b/i],
      remind: [/\bremind\b/i],
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
  CORRECTION: "CORRECTION",
  NEXT_PHRASE: "NEXT_PHRASE",
});
