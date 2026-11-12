/**
 * Session queue with shuffle, tag spacing, and forgetting-curve recalls.
 * A phrase is due when its score is below the mastered step and nextDueAt
 * has passed. P(recall) = due / (due + balance). The Don't remind list does
 * not exclude a phrase; only the top score does.
 */

import { CONFIG } from "./config.js";
import { lowerScore, raiseScore, storage } from "./storage.js";

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

export function remindProbability(eligibleCount) {
  const due = Math.max(0, Number(eligibleCount) || 0);
  if (!due) return 0;
  return due / (due + CONFIG.FORGETTING.balance);
}

export function shouldPickRemind({ eligibleCount, hasUnseen, random = Math.random() }) {
  if (!eligibleCount) return false;
  if (!hasUnseen) return true;
  return random < remindProbability(eligibleCount);
}

export function buildQueue(phrases) {
  const allIds = phrases.map((p) => p.id);
  const tagById = new Map(phrases.map((p) => [p.id, p.tags?.[0] || "phrase"]));
  return unique(diversifyTags(shuffle(allIds), tagById));
}

export function applyAttempt(phraseId, correct, now = Date.now()) {
  const prev = storage.getPhraseState(phraseId);
  const schedule = correct ? raiseScore(prev, now) : lowerScore(prev, now);
  storage.patchPhraseState(phraseId, {
    ...schedule,
    lastAttemptStatus: correct ? "correct" : "incorrect",
    reviewNext: false,
    repetitionCount: (prev.repetitionCount || 0) + (correct ? 1 : 0),
  });
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
    return !s.lastAttemptStatus && !s.score && !s.nextDueAt;
  },

  /** Phrases whose ladder step is due at `now`. The Don't remind list is ignored. */
  remindPoolIds(now = Date.now()) {
    const state = storage.getPhrasesState();
    const mastered = CONFIG.FORGETTING.masteredScore;
    return this.phrases
      .map((p) => p.id)
      .filter((id) => {
        const s = state[id];
        if (!s || !s.nextDueAt) return false;
        if ((s.score || 0) >= mastered) return false;
        const due = Date.parse(s.nextDueAt);
        return Number.isFinite(due) && due <= now;
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
   * Due phrases compete with unseen ones. More phrases due right now means
   * a higher chance of a recall. With nothing unseen left, a due phrase is
   * served whenever one exists.
   */
  next() {
    const justDidId = this.current()?.id;
    this.clearInterlude();

    const pool = this.remindPoolIds().filter((id) => id !== justDidId);
    const hasUnseen = this.ids.some((id) => id !== justDidId && this._isUnseen(id));
    const pickRemind = shouldPickRemind({ eligibleCount: pool.length, hasUnseen });

    if (pickRemind && pool.length) {
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
      due: this.remindPoolIds().length,
      mastered: Object.values(state).filter((s) => (s.score || 0) >= CONFIG.FORGETTING.masteredScore).length,
      remind: this.remindPoolIds().length,
      dontRemind: storage.getDontRemindList().length,
      remaining: Math.max(0, this.phrases.length - seen),
    };
  },
};
