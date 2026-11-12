/**
 * Native MediaSession bridge (Capacitor) — Duster plain-Bluetooth build.
 * No-op in the browser PWA.
 *
 * Steering-wheel Next/Previous arrive as AVRCP keycodes. A foreground keep-alive
 * player holds the session so keys route here instead of another media app.
 */

let listenersBound = false;
let lastTitle = "";

/** AudioManager.getMode() values. */
const AUDIO_MODE_LABELS = {
  0: "NORMAL",
  1: "RINGTONE",
  2: "IN_CALL",
  3: "IN_COMMUNICATION",
  4: "CALL_SCREENING",
};

function nativePlugin() {
  const cap = globalThis.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.CarMedia ?? null;
}

export function isNativeAndroid() {
  return !!nativePlugin();
}

async function bindListeners(plugin, loop, log) {
  if (listenersBound) return;
  listenersBound = true;
  await plugin.addListener("next", (data) => {
    if (data?.source) log(`Next volant (${data.source})`);
    loop.onPhysicalNext();
  });
  await plugin.addListener("previous", (data) => {
    if (data?.source) log(`Previous volant (${data.source})`);
    loop.onPhysicalPrevious();
  });
  await plugin.addListener("audio-warning", (data) => {
    const mode = AUDIO_MODE_LABELS[data?.audioMode] ?? `mode ${data?.audioMode}`;
    const sco = data?.sco ? " + Bluetooth SCO" : "";
    const fix = data?.restored ? " — audio rétabli hors appel" : data?.error ? ` — échec: ${data.error}` : "";
    log(`Audio hors session micro (${mode}${sco})${fix}`);
  });
  await plugin.addListener("audio-normal", () => {
    log("Audio prêt pour commodos AVRCP");
  });
  loop.addEventListener("state", (ev) => {
    updateMetadata(plugin, ev.detail.phrase).catch(() => {});
  });
  loop.addEventListener("session-stop", () => {
    lastTitle = "English Training";
    plugin
      .updateMetadata?.({
        title: "English Training",
        artist: "English Training · en attente",
      })
      .catch(() => {});
  });
}

async function updateMetadata(plugin, nextPhrase) {
  const title = nextPhrase?.fr || "English Training";
  try {
    if (title !== lastTitle) {
      lastTitle = title;
      await plugin.updateMetadata({
        title,
        artist: "English Training · session",
      });
    } else if (typeof plugin.keepAlive === "function") {
      await plugin.keepAlive();
    }
  } catch {
    /* native session may already be stopped */
  }
}

/** Hold the AVRCP MediaSession as soon as the Android app is up (Labo A/D). */
export async function holdNativeCarMedia(loop, { onLog } = {}) {
  const plugin = nativePlugin();
  if (!plugin) return false;

  const log = typeof onLog === "function" ? onLog : () => {};
  await bindListeners(plugin, loop, log);

  const phrase = loop.currentPhrase();
  await plugin.startSession({
    title: phrase?.fr || "English Training",
    artist: "English Training · session",
  });
  lastTitle = phrase?.fr || "English Training";
  return true;
}

export async function initNativeCarMedia(loop, { onLog } = {}) {
  const plugin = nativePlugin();
  if (!plugin) return false;

  const log = typeof onLog === "function" ? onLog : () => {};
  const startedHold = await holdNativeCarMedia(loop, { onLog: log });
  if (!startedHold) return false;

  const phrase = loop.currentPhrase();
  await updateMetadata(plugin, phrase);
  return true;
}
