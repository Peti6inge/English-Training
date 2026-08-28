/**
 * Spaced-repetition queue.
 * Priority 1: REMIND MONKEY flags
 * Priority 2: previously incorrect
 * Priority 3: new / unvisited
 * Then remaining due / practiced phrases.
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
  const remindIds = storage.getRemindList().map((item) => item.phraseId);

  const byId = new Map(phrases.map((p) => [p.id, p]));
  const allIds = phrases.map((p) => p.id);

  const remind = remindIds.filter((id) => byId.has(id));
  const incorrect = allIds.filter((id) => {
    const s = state[id];
    return s && (s.lastAttemptStatus === "incorrect" || s.reviewNext) && !remind.includes(id);
  });
  const unvisited = allIds.filter((id) => !state[id] && !remind.includes(id) && !incorrect.includes(id));
  const rest = allIds.filter((id) => !remind.includes(id) && !incorrect.includes(id) && !unvisited.includes(id));

  return unique([...remind, ...incorrect, ...unvisited, ...rest]);
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

  load(phrases) {
    this.phrases = phrases;
    const stored = storage.getQueue();
    const valid = stored.filter((id) => phrases.some((p) => p.id === id));
    this.ids = valid.length ? valid : buildQueue(phrases);
    storage.setQueue(this.ids);
    return this.ids;
  },

  rebuild() {
    this.ids = buildQueue(this.phrases);
    storage.setQueue(this.ids);
    const max = Math.max(0, this.ids.length - 1);
    if (storage.getCurrentIndex() > max) storage.setCurrentIndex(max);
    return this.ids;
  },

  current() {
    const idx = this.clampIndex(storage.getCurrentIndex());
    const id = this.ids[idx];
    return this.phrases.find((p) => p.id === id) || this.phrases[0] || null;
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
    const idx = this.clampIndex(index);
    storage.setCurrentIndex(idx);
    return this.current();
  },

  next() {
    return this.goTo(this.indexOfCurrent() + 1);
  },

  previous() {
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
