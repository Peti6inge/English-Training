import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAttempt, queue, remindProbability, shouldPickRemind } from "./queue.js";
import { storage } from "./storage.js";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

globalThis.localStorage = new MemoryStorage();

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-12T08:00:00.000Z");

function makePhrases(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1).padStart(3, "0")}`,
    fr: `Phrase française ${index + 1}.`,
    en: `This is training sentence number ${index + 1}.`,
    tags: index % 2 === 0 ? ["daily"] : ["travel"],
  }));
}

function dueState(score, dueAt) {
  return {
    score,
    lastAttemptStatus: "correct",
    lastReviewedAt: new Date(NOW - HOUR_MS).toISOString(),
    nextDueAt: new Date(dueAt).toISOString(),
  };
}

describe("forgetting-curve recall probability", () => {
  it("stays on new phrases when nothing is due", () => {
    assert.equal(remindProbability(0), 0);
    assert.equal(shouldPickRemind({ eligibleCount: 0, hasUnseen: true, random: 0 }), false);
    assert.equal(shouldPickRemind({ eligibleCount: 0, hasUnseen: false, random: 0 }), false);
  });

  it("uses n / (n + 7)", () => {
    assert.equal(remindProbability(1), 1 / 8);
    assert.equal(remindProbability(7), 0.5);
    assert.equal(shouldPickRemind({ eligibleCount: 7, hasUnseen: true, random: 0.49 }), true);
    assert.equal(shouldPickRemind({ eligibleCount: 7, hasUnseen: true, random: 0.5 }), false);
  });

  it("serves a due phrase once nothing unseen remains", () => {
    assert.equal(shouldPickRemind({ eligibleCount: 1, hasUnseen: false, random: 0.99 }), true);
  });
});

describe("score ladder", () => {
  it("schedules the first success eight hours later and stores score 1", () => {
    storage.resetProgress();
    applyAttempt("p001", true, NOW);
    const state = storage.getPhraseState("p001");
    assert.equal(state.score, 1);
    assert.equal(Date.parse(state.nextDueAt) - NOW, 8 * HOUR_MS);
  });

  it("steps the delay up after each success and stops at score 6", () => {
    storage.resetProgress();
    const delays = [8, 24, 72, 168, 384, 840];
    for (let step = 0; step < delays.length; step += 1) {
      applyAttempt("p001", true, NOW + step);
      const state = storage.getPhraseState("p001");
      if (step < 5) {
        assert.equal(state.score, step + 1);
        assert.equal(Date.parse(state.nextDueAt) - (NOW + step), delays[step] * HOUR_MS);
      }
    }
    const mastered = storage.getPhraseState("p001");
    assert.equal(mastered.score, 6);
    assert.equal(mastered.nextDueAt, null);
  });

  it("drops one score on a miss and reschedules that step", () => {
    storage.resetProgress();
    storage.patchPhraseState("p001", dueState(3, NOW - HOUR_MS));
    applyAttempt("p001", false, NOW);
    const state = storage.getPhraseState("p001");
    assert.equal(state.score, 2);
    assert.equal(Date.parse(state.nextDueAt) - NOW, 72 * HOUR_MS);
  });

  it("raises one score on Don't remind without a hard exclusion", () => {
    storage.resetProgress();
    storage.patchPhraseState("p001", dueState(1, NOW - HOUR_MS));
    storage.addDontRemind("p001");
    const state = storage.getPhraseState("p001");
    assert.equal(state.score, 2);
    assert.equal(Date.parse(state.nextDueAt) - Date.parse(state.lastReviewedAt), 24 * HOUR_MS);
    assert.equal(storage.isDontRemind("p001"), true);
    assert.equal(queue.remindPoolIds(NOW).includes("p001"), false);
  });

  it("lowers one score on Remind and leaves the Don't remind list", () => {
    storage.resetProgress();
    storage.setDontRemindList([{ phraseId: "p001", flaggedAt: new Date(NOW).toISOString() }]);
    storage.patchPhraseState("p001", { score: 4, lastAttemptStatus: "correct", nextDueAt: null });
    storage.addRemind("p001", "");
    const state = storage.getPhraseState("p001");
    assert.equal(state.score, 3);
    assert.equal(Date.parse(state.nextDueAt) - Date.parse(state.lastReviewedAt), 168 * HOUR_MS);
    assert.equal(storage.isDontRemind("p001"), false);
  });
});

describe("due phrase selection", () => {
  it("can draw a due phrase even when few phrases have been seen", () => {
    const phrases = makePhrases(4);
    storage.resetProgress();
    storage.setPhrasesState({
      p001: dueState(1, NOW - HOUR_MS),
    });
    queue.load(phrases);
    storage.setCurrentIndex(queue.ids.indexOf("p002"));

    const originalRandom = Math.random;
    const originalNow = Date.now;
    Math.random = () => 0;
    Date.now = () => NOW;
    try {
      const nextPhrase = queue.next();
      assert.equal(queue.isInterlude(), true);
      assert.equal(nextPhrase.id, "p001");
    } finally {
      Math.random = originalRandom;
      Date.now = originalNow;
      queue.clearInterlude();
      storage.resetProgress();
    }
  });

  it("does not treat the Don't remind list as an exclusion", () => {
    const phrases = makePhrases(3);
    storage.resetProgress();
    storage.setPhrasesState({
      p001: dueState(2, NOW - HOUR_MS),
    });
    storage.setDontRemindList([{ phraseId: "p001", flaggedAt: new Date(NOW).toISOString() }]);
    queue.load(phrases);
    storage.setCurrentIndex(queue.ids.indexOf("p002"));

    const originalRandom = Math.random;
    const originalNow = Date.now;
    Math.random = () => 0;
    Date.now = () => NOW;
    try {
      assert.deepEqual(queue.remindPoolIds(NOW), ["p001"]);
      const nextPhrase = queue.next();
      assert.equal(nextPhrase.id, "p001");
    } finally {
      Math.random = originalRandom;
      Date.now = originalNow;
      queue.clearInterlude();
      storage.resetProgress();
    }
  });

  it("skips a mastered phrase", () => {
    const phrases = makePhrases(3);
    storage.resetProgress();
    storage.setPhrasesState({
      p001: { score: 6, lastAttemptStatus: "correct", nextDueAt: null },
      p002: dueState(1, NOW - HOUR_MS),
    });
    queue.load(phrases);
    storage.setCurrentIndex(queue.ids.indexOf("p003"));

    const originalRandom = Math.random;
    const originalNow = Date.now;
    Math.random = () => 0;
    Date.now = () => NOW;
    try {
      const nextPhrase = queue.next();
      assert.equal(nextPhrase.id, "p002");
    } finally {
      Math.random = originalRandom;
      Date.now = originalNow;
      queue.clearInterlude();
      storage.resetProgress();
    }
  });
});
