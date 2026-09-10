/**
 * Native Android Auto / MediaSession bridge (Capacitor).
 * No-op in the browser PWA.
 *
 * Steering-wheel Next/Previous on the Clio + wireless AA dongle arrive as AVRCP
 * keycodes, not as Android Auto seekToNext. Keep a MediaSession for the whole
 * app lifetime so those keycodes stay routed here.
 */

let listenersBound = false;
let lastTitle = "";

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
  await plugin.addListener("mediakey", (data) => {
    if (data?.action === 0) log(`Touche média keyCode=${data.keyCode}`);
  });
  loop.addEventListener("state", (ev) => {
    updateMetadata(plugin, ev.detail.phrase).catch(() => {});
  });
  loop.addEventListener("session-stop", () => {
    plugin.setMediaRelay?.({ enabled: false }).catch(() => {});
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

async function applyPending(plugin, loop, log) {
  if (typeof plugin.drainPending !== "function") return;
  const pending = await plugin.drainPending();
  const event = pending?.event;
  if (event !== "next" && event !== "previous") return;
  if (pending.source) log(`${event === "next" ? "Next" : "Previous"} volant (${pending.source}, différé)`);
  if (event === "next") loop.onPhysicalNext();
  else loop.onPhysicalPrevious();
}

/** Hold the AVRCP MediaSession as soon as the Android app is up. */
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
  await applyPending(plugin, loop, log);
  return true;
}

export async function initNativeCarMedia(loop, { onLog, mediaRelay = false } = {}) {
  const plugin = nativePlugin();
  if (!plugin) return false;

  const log = typeof onLog === "function" ? onLog : () => {};
  const startedHold = await holdNativeCarMedia(loop, { onLog: log });
  if (!startedHold) return false;

  const phrase = loop.currentPhrase();
  await updateMetadata(plugin, phrase);

  if (mediaRelay && typeof plugin.setMediaRelay === "function") {
    const status = await plugin.setMediaRelay({ enabled: true });
    if (status?.notificationListener) log("Relais commodo via Spotify / autre appli média actif");
    else log("Relais commodo : autoriser l'accès aux notifications pour English Training");
  }

  return true;
}

export async function setNativeMediaRelay(enabled) {
  const plugin = nativePlugin();
  if (!plugin?.setMediaRelay) return { enabled: false, notificationListener: false };
  return plugin.setMediaRelay({ enabled: !!enabled });
}

export async function openNotificationAccess() {
  const plugin = nativePlugin();
  if (!plugin?.openNotificationAccess) return false;
  await plugin.openNotificationAccess();
  return true;
}

export async function notificationAccessStatus() {
  const plugin = nativePlugin();
  if (!plugin?.notificationAccess) return { notificationListener: false };
  return plugin.notificationAccess();
}
