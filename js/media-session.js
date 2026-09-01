/**
 * Route car steering-wheel media keys (Bluetooth AVRCP) to the learning loop.
 * Works in Chrome Android PWA without Android Auto — when this app holds the media session.
 */

import { CONFIG } from "./config.js";

export function initMediaSession(loop) {
  if (!("mediaSession" in navigator)) return false;

  const updateMetadata = (phrase) => {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: phrase?.fr || CONFIG.APP_NAME,
      artist: "English Training · session active",
      album: "FR → EN",
    });
  };

  navigator.mediaSession.playbackState = "playing";
  updateMetadata(loop.currentPhrase());

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
    updateMetadata(ev.detail.phrase);
  });

  loop.addEventListener("session-stop", () => {
    navigator.mediaSession.playbackState = "none";
    for (const action of ["nexttrack", "previoustrack"]) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
  });

  return true;
}
