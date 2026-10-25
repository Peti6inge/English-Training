/**
 * Route car steering-wheel media keys (Bluetooth AVRCP) to the learning loop.
 * Works in Chrome Android PWA without Android Auto — when this app holds the media session.
 *
 * Handlers stay bound after Stop so idle Next / Previous can start a session.
 */

import { CONFIG } from "./config.js";

let bound = false;

export function initMediaSession(loop) {
  if (!("mediaSession" in navigator)) return false;

  const updateMetadata = (phrase, { idle = false } = {}) => {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: phrase?.fr || CONFIG.APP_NAME,
      artist: idle ? "English Training · en attente" : "English Training · session active",
      album: "FR → EN",
    });
  };

  navigator.mediaSession.playbackState = "playing";
  updateMetadata(loop.currentPhrase(), { idle: !loop.running });

  if (bound) return true;
  bound = true;

  const bind = (action, handler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* Action not supported on this platform. */
    }
  };

  bind("nexttrack", () => {
    loop.onPhysicalNext();
  });

  bind("previoustrack", () => {
    loop.onPhysicalPrevious();
  });

  loop.addEventListener("state", (ev) => {
    navigator.mediaSession.playbackState = "playing";
    updateMetadata(ev.detail.phrase, { idle: ev.detail.state === "IDLE" });
  });

  loop.addEventListener("session-stop", () => {
    navigator.mediaSession.playbackState = "playing";
    updateMetadata(loop.currentPhrase(), { idle: true });
  });

  return true;
}
