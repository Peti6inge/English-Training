/**
 * Session queue with occasional random Remind interludes.
 * Regular order: previously incorrect → new → remaining practiced phrases.
 */

import { CONFIG } from "./config.js";
import { storage } from "./storage.js";

function unique(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildQueue(phrases) {
  const state = storage.getPhrasesState();
  const allIds = phrases.map((p) => p.id);

  const incorrect = allIds.filter((id) => {
    const s = state[id];
    return s && (s.lastAttemptStatus === "incorrect" || s.reviewNext);
  });
  const unvisited = allIds.filter((id) => !state[id] && !incorrect.includes(id));
  const rest = allIds.filter((id) => !incorrect.includes(id) && !unvisited.includes(id));

  return unique([...incorrect, ...unvisited, ...rest]);
}

export function applyAttempt(phraseId, correct) {
  const prev = storage.getPhraseState(phraseId);
  if (correct) {
    const repetitionCount = (prev.repetitionCount || 0) + 1;
    const interval = Math.min(
      CONFIG.SM2.maxInterval,
      Math.max(CONFIG.SM2.minInterval, Math.round((prev.interval || 1) * CONFIG.SM2.easyBonus || 1)),
    );
    storage.patchPhraseState(phraseId, {
      lastAttemptStatus: "correct",
      reviewNext: false,
      repetitionCount,
      interval,
    });
    storage.removeRemind(phraseId);
  } else {
    storage.patchPhraseState(phraseId, {
      lastAttemptStatus: "incorrect",
      reviewNext: true,
      interval: 0,
    });
  }
}

export const queue = {
  ids: [],
  phrases: [],
  _interludeId: null,
  _pendingIndex: null,
  _regularsSinceRemind: 0,

  load(phrases) {
    this.phrases = phrases;
    this.clearInterlude();
    const stored = storage.getQueue();
    const valid = stored.filter((id) => phrases.some((p) => p.id === id));
    this.ids = valid.length ? valid : buildQueue(phrases);
    storage.setQueue(this.ids);
    return this.ids;
  },

  rebuild() {
    this.clearInterlude();
    this.ids = buildQueue(this.phrases);
    storage.setQueue(this.ids);
    const max = Math.max(0, this.ids.length - 1);
    if (storage.getCurrentIndex() > max) storage.setCurrentIndex(max);
    return this.ids;
  },

  clearInterlude() {
    this._interludeId = null;
    this._pendingIndex = null;
  },

  isInterlude() {
    return !!this._interludeId;
  },

  remindPoolIds() {
    const known = new Set(this.phrases.map((p) => p.id));
    return storage
      .getRemindList()
      .map((item) => item.phraseId)
      .filter((id) => known.has(id));
  },

  _regularCurrent() {
    const idx = this.clampIndex(storage.getCurrentIndex());
    const id = this.ids[idx];
    return this.phrases.find((p) => p.id === id) || this.phrases[0] || null;
  },

  current() {
    if (this._interludeId) {
      return this.phrases.find((p) => p.id === this._interludeId) || this._regularCurrent();
    }
    return this._regularCurrent();
  },

  indexOfCurrent() {
    return this.clampIndex(storage.getCurrentIndex());
  },

  clampIndex(index) {
    if (!this.ids.length) return 0;
    const n = Number(index) || 0;
    return ((n % this.ids.length) + this.ids.length) % this.ids.length;
  },

  goTo(index) {
    this.clearInterlude();
    const idx = this.clampIndex(index);
    storage.setCurrentIndex(idx);
    return this.current();
  },

  next() {
    if (this._interludeId) {
      const idx = this._pendingIndex != null ? this._pendingIndex : this.indexOfCurrent() + 1;
      this.clearInterlude();
      return this.goTo(idx);
    }

    const nextIndex = this.indexOfCurrent() + 1;
    this._regularsSinceRemind += 1;
    const currentId = this._regularCurrent()?.id;
    const pool = this.remindPoolIds().filter((id) => id !== currentId);

    if (pool.length && this._regularsSinceRemind >= CONFIG.REMIND_INSERT_EVERY) {
      this._interludeId = pool[Math.floor(Math.random() * pool.length)];
      this._pendingIndex = nextIndex;
      this._regularsSinceRemind = 0;
      return this.current();
    }

    return this.goTo(nextIndex);
  },

  previous() {
    this.clearInterlude();
    return this.goTo(this.indexOfCurrent() - 1);
  },

  stats() {
    const state = storage.getPhrasesState();
    let correct = 0;
    let incorrect = 0;
    let seen = 0;
    for (const id of Object.keys(state)) {
      seen += 1;
      if (state[id].lastAttemptStatus === "correct") correct += 1;
      if (state[id].lastAttemptStatus === "incorrect") incorrect += 1;
    }
    return {
      total: this.phrases.length,
      seen,
      correct,
      incorrect,
      remind: storage.getRemindList().length,
      remaining: Math.max(0, this.phrases.length - seen),
    };
  },
};
