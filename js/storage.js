/**
 * Dual persistence: localStorage for the spec keys, IndexedDB as a durable mirror
 * plus session history. localStorage remains the source of truth for:
 *   currentIndex, phrasesState, customRemindList, dontRemindList
 *
 * Phrase recall states:
 *   not seen yet → score 0, no nextDueAt
 *   learning     → score 1–5, nextDueAt on the forgetting ladder
 *   mastered     → score 6, never recalled
 * Don't remind / Remind keep their lists for the existing UI, but the list
 * does not exclude a phrase. Each Don't remind raises the score by one;
 * each Remind lowers it by one.
 */

import { CONFIG } from "./config.js";

const LS = {
  currentIndex: `${CONFIG.STORAGE_PREFIX}.currentIndex`,
  phrasesState: `${CONFIG.STORAGE_PREFIX}.phrasesState`,
  customRemindList: `${CONFIG.STORAGE_PREFIX}.customRemindList`,
  dontRemindList: `${CONFIG.STORAGE_PREFIX}.dontRemindList`,
  queue: `${CONFIG.STORAGE_PREFIX}.queue`,
  settings: `${CONFIG.STORAGE_PREFIX}.settings`,
};

const PROGRESS_EXPORT = Object.freeze({
  format: "english-training-progress",
  version: 1,
});

const DEFAULT_SETTINGS = Object.freeze({
  /** Play media-channel beeps when the microphone opens or closes. */
  micCues: true,
  /** "minimal" is the default UI; "legacy" restores the previous interface. */
  uiMode: "minimal",
});

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.IDB_NAME, CONFIG.IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
      if (!db.objectStoreNames.contains("history")) {
        const store = db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
        store.createIndex("at", "at");
        store.createIndex("phraseId", "phraseId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;

function getDb() {
  if (!dbPromise) dbPromise = openDb().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

async function idbPut(store, key, value) {
  try {
    const db = await getDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      if (key == null) tx.objectStore(store).add(value);
      else tx.objectStore(store).put(value, key);
    });
  } catch {
    /* IndexedDB unavailable — localStorage still works. */
  }
}

async function idbGet(store, key) {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

const HOUR_MS = 60 * 60 * 1000;

function emptyPhraseState() {
  return {
    interval: 0,
    repetitionCount: 0,
    reviewNext: false,
    lastAttemptStatus: null,
    score: 0,
    lastReviewedAt: null,
    nextDueAt: null,
  };
}

/** Seen phrases saved before the ladder become score 1, due immediately. */
export function normalizePhraseState(raw) {
  const state = { ...emptyPhraseState(), ...raw };
  if (raw == null || raw.score == null) {
    if (state.lastAttemptStatus) {
      state.score = 1;
      if (!state.nextDueAt) state.nextDueAt = new Date().toISOString();
    }
  }
  return state;
}

/**
 * Successful step. The delay is the interval of the score just demonstrated,
 * then the score increases. The top score clears the next due date.
 */
export function raiseScore(prev, now = Date.now()) {
  const current = Math.max(0, Number(prev?.score) || 0);
  const { intervalsHours, masteredScore } = CONFIG.FORGETTING;
  const next = current + 1;
  const at = new Date(now).toISOString();
  if (next >= masteredScore) {
    return { score: masteredScore, lastReviewedAt: at, nextDueAt: null, interval: 0 };
  }
  const hours = intervalsHours[Math.min(current, intervalsHours.length - 1)];
  return {
    score: next,
    lastReviewedAt: at,
    nextDueAt: new Date(now + hours * HOUR_MS).toISOString(),
    interval: hours,
  };
}

/** One step down the ladder (floor 0), then reschedule from that score. */
export function lowerScore(prev, now = Date.now()) {
  const { intervalsHours } = CONFIG.FORGETTING;
  const score = Math.max(0, (Number(prev?.score) || 0) - 1);
  const hours = intervalsHours[Math.min(score, intervalsHours.length - 1)];
  return {
    score,
    lastReviewedAt: new Date(now).toISOString(),
    nextDueAt: new Date(now + hours * HOUR_MS).toISOString(),
    interval: hours,
  };
}

export const storage = {
  async init() {
    try {
      await getDb();
    } catch {
      /* continue with localStorage only */
    }

    if (localStorage.getItem(LS.phrasesState) == null) {
      const mirrored = await idbGet("kv", "snapshot");
      if (mirrored && typeof mirrored === "object") {
        if (typeof mirrored.currentIndex === "number") {
          this.setCurrentIndex(mirrored.currentIndex);
        }
        if (mirrored.phrasesState) this.setPhrasesState(mirrored.phrasesState);
        if (mirrored.customRemindList) this.setRemindList(mirrored.customRemindList);
        if (mirrored.dontRemindList) this.setDontRemindList(mirrored.dontRemindList);
        if (mirrored.queue) this.setQueue(mirrored.queue);
      }
    }
    return this.snapshot();
  },

  getCurrentIndex() {
    const n = Number(localStorage.getItem(LS.currentIndex));
    return Number.isFinite(n) ? n : 0;
  },

  setCurrentIndex(index) {
    localStorage.setItem(LS.currentIndex, String(index));
    this._mirror();
  },

  /** @returns {Record<string, { score: number, nextDueAt: string|null, lastReviewedAt: string|null, interval: number, repetitionCount: number, reviewNext: boolean, lastAttemptStatus: string|null }>} */
  getPhrasesState() {
    const all = readJson(LS.phrasesState, {});
    return Object.fromEntries(
      Object.entries(all).map(([id, raw]) => [id, normalizePhraseState(raw)]),
    );
  },

  setPhrasesState(map) {
    writeJson(LS.phrasesState, map);
    this._mirror();
  },

  getPhraseState(phraseId) {
    const all = this.getPhrasesState();
    return all[phraseId] ? { ...emptyPhraseState(), ...all[phraseId] } : emptyPhraseState();
  },

  patchPhraseState(phraseId, patch) {
    const all = this.getPhrasesState();
    all[phraseId] = { ...emptyPhraseState(), ...all[phraseId], ...patch };
    this.setPhrasesState(all);
    return all[phraseId];
  },

  /** @returns {{ phraseId: string, note: string, flaggedAt: string }[]} */
  getRemindList() {
    return readJson(LS.customRemindList, []);
  },

  setRemindList(list) {
    writeJson(LS.customRemindList, list);
    this._mirror();
  },

  /**
   * Same gesture as before (leave the Don't remind list, keep an optional note).
   * The schedule effect is one score step down, not an immediate recall.
   */
  addRemind(phraseId, note = "") {
    this.removeDontRemind(phraseId);
    const list = this.getRemindList();
    const existing = list.find((item) => item.phraseId === phraseId);
    if (existing) {
      existing.note = note || existing.note;
      existing.flaggedAt = new Date().toISOString();
    } else if (note) {
      list.push({ phraseId, note, flaggedAt: new Date().toISOString() });
    }
    this.setRemindList(list);
    const prev = this.getPhraseState(phraseId);
    this.patchPhraseState(phraseId, { ...lowerScore(prev), reviewNext: false });
    return list;
  },

  removeRemind(phraseId) {
    const list = this.getRemindList().filter((item) => item.phraseId !== phraseId);
    this.setRemindList(list);
    return list;
  },

  /** @returns {{ phraseId: string, flaggedAt: string }[]} */
  getDontRemindList() {
    return readJson(LS.dontRemindList, []);
  },

  setDontRemindList(list) {
    writeJson(LS.dontRemindList, list);
    this._mirror();
  },

  isDontRemind(phraseId) {
    return this.getDontRemindList().some((item) => item.phraseId === phraseId);
  },

  /** Same list gesture as before. The schedule effect is one score step up. */
  addDontRemind(phraseId) {
    this.removeRemind(phraseId);
    const list = this.getDontRemindList();
    const existing = list.find((item) => item.phraseId === phraseId);
    if (existing) {
      existing.flaggedAt = new Date().toISOString();
    } else {
      list.push({ phraseId, flaggedAt: new Date().toISOString() });
    }
    this.setDontRemindList(list);
    const prev = this.getPhraseState(phraseId);
    this.patchPhraseState(phraseId, { ...raiseScore(prev), reviewNext: false });
    return list;
  },

  removeDontRemind(phraseId) {
    const list = this.getDontRemindList().filter((item) => item.phraseId !== phraseId);
    this.setDontRemindList(list);
    return list;
  },

  /** @returns {{ micCues: boolean, uiMode: "minimal"|"legacy" }} */
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...readJson(LS.settings, {}) };
  },

  setSettings(patch) {
    writeJson(LS.settings, { ...this.getSettings(), ...patch });
  },

  getQueue() {
    return readJson(LS.queue, []);
  },

  setQueue(ids) {
    writeJson(LS.queue, ids);
    this._mirror();
  },

  async logAttempt(entry) {
    await idbPut("history", null, {
      ...entry,
      at: Date.now(),
    });
  },

  snapshot() {
    return {
      currentIndex: this.getCurrentIndex(),
      phrasesState: this.getPhrasesState(),
      customRemindList: this.getRemindList(),
      dontRemindList: this.getDontRemindList(),
      queue: this.getQueue(),
    };
  },

  exportProgressDocument() {
    return {
      ...PROGRESS_EXPORT,
      exportedAt: new Date().toISOString(),
      app: CONFIG.APP_NAME,
      ...this.snapshot(),
    };
  },

  /** @param {ReturnType<typeof storage.snapshot>} snapshot */
  applySnapshot(snapshot) {
    this.setCurrentIndex(snapshot.currentIndex);
    this.setPhrasesState(snapshot.phrasesState);
    this.setRemindList(snapshot.customRemindList);
    this.setDontRemindList(snapshot.dontRemindList);
    this.setQueue(snapshot.queue);
  },

  parseProgressFile(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Fichier JSON illisible");
    }
    if (!data || typeof data !== "object") {
      throw new Error("Fichier de progression invalide");
    }
    if (data.format != null && data.format !== PROGRESS_EXPORT.format) {
      throw new Error("Format de fichier non reconnu");
    }
    if (data.version != null && data.version !== PROGRESS_EXPORT.version) {
      throw new Error(`Version de fichier non prise en charge (${data.version})`);
    }
    const currentIndex = Number(data.currentIndex);
    if (!Number.isFinite(currentIndex) || currentIndex < 0) {
      throw new Error("Index de progression invalide");
    }
    if (!data.phrasesState || typeof data.phrasesState !== "object" || Array.isArray(data.phrasesState)) {
      throw new Error("État des phrases invalide");
    }
    if (!Array.isArray(data.customRemindList) || !Array.isArray(data.dontRemindList) || !Array.isArray(data.queue)) {
      throw new Error("Listes de progression invalides");
    }
    return {
      currentIndex,
      phrasesState: data.phrasesState,
      customRemindList: data.customRemindList,
      dontRemindList: data.dontRemindList,
      queue: data.queue,
    };
  },

  resetProgress() {
    localStorage.removeItem(LS.currentIndex);
    localStorage.removeItem(LS.phrasesState);
    localStorage.removeItem(LS.customRemindList);
    localStorage.removeItem(LS.dontRemindList);
    localStorage.removeItem(LS.queue);
    this._mirror();
  },

  _mirror() {
    idbPut("kv", "snapshot", this.snapshot());
  },
};
