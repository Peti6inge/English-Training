/**
 * Native Android Auto / MediaSession bridge (Capacitor).
 * No-op in the browser PWA.
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

export async function initNativeCarMedia(loop, { onLog, mediaRelay = false } = {}) {
  const plugin = nativePlugin();
  if (!plugin) return false;

  const log = typeof onLog === "function" ? onLog : () => {};
  const phrase = loop.currentPhrase();
  const started = await plugin.startSession({
    title: phrase?.fr || "English Training",
    artist: "English Training · session",
  });
  lastTitle = phrase?.fr || "English Training";

  const update = async (nextPhrase) => {
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
  };

  if (!listenersBound) {
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
      update(ev.detail.phrase);
    });
    loop.addEventListener("session-stop", () => {
      plugin.setMediaRelay?.({ enabled: false }).catch(() => {});
      plugin.stopSession().catch(() => {});
    });
  }

  if (mediaRelay && typeof plugin.setMediaRelay === "function") {
    const status = await plugin.setMediaRelay({ enabled: true });
    if (status?.notificationListener) log("Relais commodo via Spotify / autre appli média actif");
    else log("Relais commodo : autoriser l'accès aux notifications pour English Training");
  }

  if (started?.notificationListener === false && mediaRelay) {
    log("Paramètres → Accès aux notifications → English Training");
  }

  await update(phrase);
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
