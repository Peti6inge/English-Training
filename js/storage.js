/**
 * Dual persistence: localStorage for the spec keys, IndexedDB as a durable mirror
 * plus session history. localStorage remains the source of truth for:
 *   currentIndex, phrasesState, customRemindList
 */

import { CONFIG } from "./config.js";

const LS = {
  currentIndex: `${CONFIG.STORAGE_PREFIX}.currentIndex`,
  phrasesState: `${CONFIG.STORAGE_PREFIX}.phrasesState`,
  customRemindList: `${CONFIG.STORAGE_PREFIX}.customRemindList`,
  queue: `${CONFIG.STORAGE_PREFIX}.queue`,
  settings: `${CONFIG.STORAGE_PREFIX}.settings`,
};

const DEFAULT_SETTINGS = Object.freeze({
  /** Play media-channel beeps when the microphone opens or closes. */
  micCues: true,
  /** Relay steering-wheel skips from Spotify / other media apps. */
  mediaRelay: false,
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

function emptyPhraseState() {
  return {
    interval: 0,
    repetitionCount: 0,
    reviewNext: false,
    lastAttemptStatus: null,
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

  /** @returns {Record<string, { interval: number, repetitionCount: number, reviewNext: boolean, lastAttemptStatus: string|null }>} */
  getPhrasesState() {
    return readJson(LS.phrasesState, {});
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

  addRemind(phraseId, note = "") {
    const list = this.getRemindList();
    const existing = list.find((item) => item.phraseId === phraseId);
    if (existing) {
      existing.note = note || existing.note;
      existing.flaggedAt = new Date().toISOString();
    } else {
      list.push({ phraseId, note, flaggedAt: new Date().toISOString() });
    }
    this.setRemindList(list);
    this.patchPhraseState(phraseId, { reviewNext: true });
    return list;
  },

  removeRemind(phraseId) {
    const list = this.getRemindList().filter((item) => item.phraseId !== phraseId);
    this.setRemindList(list);
    return list;
  },

  /** @returns {{ micCues: boolean, mediaRelay: boolean }} */
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
      queue: this.getQueue(),
    };
  },

  resetProgress() {
    localStorage.removeItem(LS.currentIndex);
    localStorage.removeItem(LS.phrasesState);
    localStorage.removeItem(LS.customRemindList);
    localStorage.removeItem(LS.queue);
    this._mirror();
  },

  _mirror() {
    idbPut("kv", "snapshot", this.snapshot());
  },
};
