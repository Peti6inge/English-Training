package com.peti6inge.englishtraining;

/**
 * Last Next/Previous wins, with AVRCP debounce. Survives a missing Capacitor plugin
 * until JS drains it or the TTL expires.
 */
final class WheelCommandBuffer {
  static final long DEBOUNCE_MS = 280L;
  static final long PENDING_TTL_MS = 15_000L;

  static final class Pending {
    final String event;
    final String source;

    Pending(String event, String source) {
      this.event = event;
      this.source = source;
    }
  }

  private String lastEvent;
  private long lastAt;
  private String pendingEvent;
  private String pendingSource;
  private long pendingAt;
  private boolean delivered;

  boolean accept(String event, long now) {
    if (event == null || event.isEmpty()) return false;
    if (event.equals(lastEvent) && now - lastAt < DEBOUNCE_MS) return false;
    lastEvent = event;
    lastAt = now;
    return true;
  }

  void hold(String event, String source, long now, boolean deliveredToBridge) {
    pendingEvent = event;
    pendingSource = source;
    pendingAt = now;
    delivered = deliveredToBridge;
  }

  void markUndelivered() {
    if (pendingEvent != null) delivered = false;
  }

  Pending takeUndelivered(long now) {
    if (!hasFreshPending(now)) return null;
    if (delivered) {
      clearPending();
      return null;
    }
    Pending pending = new Pending(pendingEvent, pendingSource);
    clearPending();
    return pending;
  }

  void clearPending() {
    pendingEvent = null;
    pendingSource = null;
    pendingAt = 0L;
    delivered = false;
  }

  boolean hasFreshPending(long now) {
    if (pendingEvent == null) return false;
    if (now - pendingAt > PENDING_TTL_MS) {
      clearPending();
      return false;
    }
    return true;
  }
}
