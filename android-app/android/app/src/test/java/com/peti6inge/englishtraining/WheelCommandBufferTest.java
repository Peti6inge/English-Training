package com.peti6inge.englishtraining;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WheelCommandBufferTest {
  @Test
  public void debounceDropsSameEventInsideWindow() {
    WheelCommandBuffer buffer = new WheelCommandBuffer();
    assertTrue(buffer.accept("next", 1000L));
    assertFalse(buffer.accept("next", 1000L + WheelCommandBuffer.DEBOUNCE_MS - 1));
    assertTrue(buffer.accept("next", 1000L + WheelCommandBuffer.DEBOUNCE_MS));
  }

  @Test
  public void oppositeDirectionIsNotDebounced() {
    WheelCommandBuffer buffer = new WheelCommandBuffer();
    assertTrue(buffer.accept("next", 1000L));
    assertTrue(buffer.accept("previous", 1100L));
  }

  @Test
  public void undeliveredPendingIsDrainedOnce() {
    WheelCommandBuffer buffer = new WheelCommandBuffer();
    buffer.hold("next", "keycode", 1000L, false);
    WheelCommandBuffer.Pending first = buffer.takeUndelivered(1500L);
    assertNotNull(first);
    assertEquals("next", first.event);
    assertEquals("keycode", first.source);
    assertNull(buffer.takeUndelivered(1600L));
  }

  @Test
  public void deliveredPendingIsClearedWithoutReplay() {
    WheelCommandBuffer buffer = new WheelCommandBuffer();
    buffer.hold("previous", "keycode", 1000L, true);
    assertNull(buffer.takeUndelivered(1500L));
    assertFalse(buffer.hasFreshPending(1500L));
  }

  @Test
  public void markUndeliveredAllowsReplayAfterPluginDeath() {
    WheelCommandBuffer buffer = new WheelCommandBuffer();
    buffer.hold("next", "keycode", 1000L, true);
    buffer.markUndelivered();
    WheelCommandBuffer.Pending pending = buffer.takeUndelivered(1500L);
    assertNotNull(pending);
    assertEquals("next", pending.event);
  }

  @Test
  public void expiredPendingIsDropped() {
    WheelCommandBuffer buffer = new WheelCommandBuffer();
    buffer.hold("next", "keycode", 1000L, false);
    assertNull(buffer.takeUndelivered(1000L + WheelCommandBuffer.PENDING_TTL_MS + 1));
  }

  @Test
  public void lastHoldWins() {
    WheelCommandBuffer buffer = new WheelCommandBuffer();
    buffer.hold("next", "keycode", 1000L, false);
    buffer.hold("previous", "player", 1200L, false);
    WheelCommandBuffer.Pending pending = buffer.takeUndelivered(1300L);
    assertNotNull(pending);
    assertEquals("previous", pending.event);
    assertEquals("player", pending.source);
  }
}
