/**
 * Sanity check: 1.0.13-style progress JSON imports with current storage.js
 * Run: node --test js/storage-import-compat.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { storage, normalizePhraseState } from "./storage.js";

const legacyExport = {
  format: "english-training-progress",
  version: 1,
  exportedAt: "2026-10-20T12:00:00.000Z",
  app: "English Training",
  currentIndex: 42,
  phrasesState: {
    "p-001": {
      interval: 24,
      repetitionCount: 3,
      reviewNext: true,
      lastAttemptStatus: "ok",
    },
    "p-002": {
      interval: 0,
      repetitionCount: 1,
      reviewNext: false,
      lastAttemptStatus: "fail",
    },
  },
  customRemindList: [{ phraseId: "p-001", note: "tricky", flaggedAt: "2026-10-19T10:00:00.000Z" }],
  dontRemindList: [{ phraseId: "p-002", flaggedAt: "2026-10-18T10:00:00.000Z" }],
  queue: ["p-001", "p-002", "p-003"],
};

describe("import compatibility with 1.0.13 exports", () => {
  it("parses legacy export (format v1, no score ladder fields)", () => {
    const parsed = storage.parseProgressFile(JSON.stringify(legacyExport));
    assert.equal(parsed.currentIndex, 42);
    assert.deepEqual(parsed.queue, legacyExport.queue);
    assert.equal(parsed.phrasesState["p-001"].lastAttemptStatus, "ok");
  });

  it("normalizes legacy phrase rows after import", () => {
    const p1 = normalizePhraseState(legacyExport.phrasesState["p-001"]);
    assert.equal(p1.score, 1);
    assert.ok(p1.nextDueAt);
  });

  it("rejects unknown format version", () => {
    assert.throws(
      () => storage.parseProgressFile(JSON.stringify({ ...legacyExport, version: 99 })),
      /Version de fichier non prise en charge/,
    );
  });
});
