/**
 * Focused regression test: correction-phase voice commands must be detectable
 * on the live STT buffer (not only after physical Next / commitPartial).
 *
 * Run: node --test js/commands.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectCommand } from "./commands.js";

describe("correction voice commands (immediate dispatch)", () => {
  const cases = [
    { buffer: "repeat french", type: "REPEAT_FRENCH" },
    { buffer: "repeat english", type: "REPEAT_ENGLISH" },
    { buffer: "previous", type: "PREVIOUS" },
    { buffer: "next", type: "NEXT" },
    { buffer: "remind", type: "REMIND" },
    { buffer: "don't remind", type: "DONT_REMIND" },
    { buffer: "stop", type: "STOP" },
  ];

  for (const { buffer, type } of cases) {
    it(`detects ${type} at end of buffer`, () => {
      const command = detectCommand(buffer, { phase: "correction" });
      assert.equal(command?.type, type, `expected ${type} for "${buffer}"`);
    });
  }

  it("does not treat mid-utterance commands as trailing", () => {
    assert.equal(detectCommand("repeat french please", { phase: "correction" }), null);
  });

  it("listening phase still only allows PREVIOUS", () => {
    assert.equal(detectCommand("repeat french", { phase: "listening" }), null);
    assert.equal(detectCommand("previous", { phase: "listening" })?.type, "PREVIOUS");
  });
});
