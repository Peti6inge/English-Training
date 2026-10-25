/**
 * Idle steering-wheel keys must request a session start instead of being ignored.
 *
 * Run: node --test js/loop.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoopManager } from "./loop.js";

describe("idle steering-wheel start", () => {
  it("emits idle-start on Next while stopped", async () => {
    const mgr = new LoopManager();
    const events = [];
    mgr.addEventListener("idle-start", (ev) => events.push(ev.detail.direction));
    await mgr.onPhysicalNext();
    assert.deepEqual(events, ["next"]);
    assert.equal(mgr.running, false);
    assert.equal(mgr.state, "IDLE");
  });

  it("emits idle-start on Previous while stopped", async () => {
    const mgr = new LoopManager();
    const events = [];
    mgr.addEventListener("idle-start", (ev) => events.push(ev.detail.direction));
    await mgr.onPhysicalPrevious();
    assert.deepEqual(events, ["previous"]);
    assert.equal(mgr.running, false);
  });
});
