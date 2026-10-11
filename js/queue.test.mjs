import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queue, shouldPickRemind } from "./queue.js";
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

function makePhrases(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1).padStart(3, "0")}`,
    fr: `Phrase française ${index + 1}.`,
    en: `This is training sentence number ${index + 1}.`,
    tags: ["daily"],
  }));
}

function setSeen(ids) {
  storage.setPhrasesState(
    Object.fromEntries(ids.map((id) => [id, { lastAttemptStatus: "correct", reviewNext: false }])),
  );
}

describe("automatic Remind selection", () => {
  it("keeps serving new phrases below the minimum recall pool size", () => {
    assert.equal(shouldPickRemind({ poolSize: 19, hasUnseen: true, random: 0 }), false);
  });

  it("selects a recall at the configured probability once the threshold is met", () => {
    assert.equal(shouldPickRemind({ poolSize: 20, hasUnseen: true, random: 0.49 }), true);
    assert.equal(shouldPickRemind({ poolSize: 20, hasUnseen: true, random: 0.5 }), false);
  });

  it("keeps recalls available after every phrase has been seen", () => {
    assert.equal(shouldPickRemind({ poolSize: 20, hasUnseen: false, random: 0.99 }), true);
  });

  it("does not create an automatic recall below the threshold when none are unseen", () => {
    assert.equal(shouldPickRemind({ poolSize: 19, hasUnseen: false, random: 0 }), false);
  });

  it("starts automatic recall as soon as 20 phrases have been seen", () => {
    const phrases = makePhrases(22);
    storage.resetProgress();
    setSeen(phrases.slice(0, 20).map((phrase) => phrase.id));
    queue.load(phrases);
    storage.setCurrentIndex(queue.ids.indexOf("p001"));

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const nextPhrase = queue.next();
      assert.equal(queue.isInterlude(), true);
      assert.notEqual(nextPhrase.id, "p001");
      assert.ok(nextPhrase.id <= "p020");
    } finally {
      Math.random = originalRandom;
      queue.clearInterlude();
      storage.resetProgress();
    }
  });

  it("excludes blacklisted phrases from the threshold and automatic recall candidates", () => {
    const phrases = makePhrases(22);
    storage.resetProgress();
    setSeen(phrases.slice(0, 20).map((phrase) => phrase.id));
    storage.setDontRemindList([{ phraseId: "p002", flaggedAt: "2026-10-11T00:00:00.000Z" }]);
    queue.load(phrases);
    storage.setCurrentIndex(queue.ids.indexOf("p001"));

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const nextPhrase = queue.next();
      assert.equal(queue.isInterlude(), false);
      assert.ok(["p021", "p022"].includes(nextPhrase.id));
    } finally {
      Math.random = originalRandom;
      queue.clearInterlude();
      storage.resetProgress();
    }
  });
});
