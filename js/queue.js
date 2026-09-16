/**
 * Session queue with shuffle, tag spacing, and Bernoulli Remind draws.
 * Each advance: REMIND_PROBABILITY → random Remind pool hit, else → next unseen.
 * Priority when building the unseen order: incorrect → unvisited → rest.
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

function shuffle(ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Reorder so consecutive phrases rarely share the same tag. */
function diversifyTags(ids, tagById) {
  const remaining = [...ids];
  const out = [];
  let lastTag = null;

  while (remaining.length) {
    let pick = remaining.findIndex((id) => tagById.get(id) !== lastTag);
    if (pick === -1) pick = 0;
    const id = remaining.splice(pick, 1)[0];
    lastTag = tagById.get(id) || null;
    out.push(id);
  }
  return out;
}

export function buildQueue(phrases) {
  const state = storage.getPhrasesState();
  const allIds = phrases.map((p) => p.id);
  const tagById = new Map(phrases.map((p) => [p.id, p.tags?.[0] || "phrase"]));

  const incorrect = allIds.filter((id) => {
    const s = state[id];
    return s && (s.lastAttemptStatus === "incorrect" || s.reviewNext);
  });
  const unvisited = allIds.filter((id) => !state[id] && !incorrect.includes(id));
  const rest = allIds.filter((id) => !incorrect.includes(id) && !unvisited.includes(id));

  const segments = [
    diversifyTags(shuffle(incorrect), tagById),
    diversifyTags(shuffle(unvisited), tagById),
    diversifyTags(shuffle(rest), tagById),
  ];

  return unique(segments.flat());
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

  load(phrases) {
    this.phrases = phrases;
    this.clearInterlude();
    const known = new Set(phrases.map((p) => p.id));
    const poolIds = phrases.map((p) => p.id);
    const stored = storage.getQueue().filter((id) => known.has(id));
    const queueMatchesPool =
      stored.length === poolIds.length && poolIds.every((id) => stored.includes(id));

    if (queueMatchesPool) {
      this.ids = stored;
    } else {
      this.ids = buildQueue(phrases);
      storage.setQueue(this.ids);
      const max = Math.max(0, this.ids.length - 1);
      if (storage.getCurrentIndex() > max) storage.setCurrentIndex(0);
    }
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
  },

  isInterlude() {
    return !!this._interludeId;
  },

  _isUnseen(phraseId) {
    const s = storage.getPhrasesState()[phraseId];
    if (!s) return true;
    return !s.lastAttemptStatus && !s.reviewNext;
  },

  remindPoolIds() {
    const blocked = new Set(storage.getDontRemindList().map((item) => item.phraseId));
    const state = storage.getPhrasesState();
    return this.phrases
      .map((p) => p.id)
      .filter((id) => {
        if (blocked.has(id)) return false;
        const s = state[id];
        if (!s) return false;
        return s.lastAttemptStatus === "correct" || s.lastAttemptStatus === "incorrect" || s.reviewNext;
      });
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

  /**
   * Bernoulli draw on every advance (including after a Remind):
   *   P(Remind) = REMIND_PROBABILITY when the Remind pool is non-empty and unseen remain
   *   else next unseen ("nouvelle pioche")
   * If no unseen remain → always Remind. If pool empty → always unseen/queue.
   */
  next() {
    const justDidId = this.current()?.id;
    this.clearInterlude();

    const pool = this.remindPoolIds().filter((id) => id !== justDidId);
    const hasUnseen = this.ids.some((id) => this._isUnseen(id));

    let pickRemind = false;
    if (pool.length && !hasUnseen) pickRemind = true;
    else if (pool.length && hasUnseen) pickRemind = Math.random() < CONFIG.REMIND_PROBABILITY;

    if (pickRemind) {
      this._interludeId = pool[Math.floor(Math.random() * pool.length)];
      return this.current();
    }

    return this._goToNextUnseenFrom(this.indexOfCurrent(), justDidId);
  },

  _goToNextUnseenFrom(startIdx, excludeId) {
    for (let step = 1; step <= this.ids.length; step++) {
      const i = this.clampIndex(startIdx + step);
      const id = this.ids[i];
      if (id !== excludeId && this._isUnseen(id)) {
        return this.goTo(i);
      }
    }

    const pool = this.remindPoolIds().filter((id) => id !== excludeId);
    if (pool.length) {
      this._interludeId = pool[Math.floor(Math.random() * pool.length)];
      return this.current();
    }

    return this.goTo(startIdx + 1);
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
      remind: this.remindPoolIds().length,
      dontRemind: storage.getDontRemindList().length,
      remaining: Math.max(0, this.phrases.length - seen),
    };
  },
};
