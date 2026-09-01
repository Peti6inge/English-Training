/**
 * Keeps the screen awake during a session and re-acquires the lock after visibility changes.
 */

export class WakeLockManager {
  constructor() {
    this._sentinel = null;
    this._wanted = false;
    this._onVisible = null;
    this._boundVisibility = () => this._handleVisibility();
  }

  /** @param {() => void} [onVisible] Called when the page becomes visible while a session is active. */
  init(onVisible) {
    this._onVisible = onVisible;
    document.addEventListener("visibilitychange", this._boundVisibility);
  }

  get supported() {
    return "wakeLock" in navigator;
  }

  async acquire() {
    if (!this.supported) return false;
    this._wanted = true;
    try {
      if (this._sentinel) return true;
      this._sentinel = await navigator.wakeLock.request("screen");
      this._sentinel.addEventListener("release", () => {
        this._sentinel = null;
        if (this._wanted) this.acquire();
      });
      return true;
    } catch {
      return false;
    }
  }

  async release() {
    this._wanted = false;
    if (!this._sentinel) return;
    try {
      await this._sentinel.release();
    } catch {
      /* ignore */
    }
    this._sentinel = null;
  }

  _handleVisibility() {
    if (document.visibilityState !== "visible" || !this._wanted) return;
    this.acquire();
    this._onVisible?.();
  }
}

export const wakeLock = new WakeLockManager();
