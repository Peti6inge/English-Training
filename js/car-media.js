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

export async function initNativeCarMedia(loop) {
  const plugin = nativePlugin();
  if (!plugin) return false;

  const phrase = loop.currentPhrase();
  await plugin.startSession({
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
    await plugin.addListener("next", () => {
      loop.onPhysicalNext();
    });
    await plugin.addListener("previous", () => {
      loop.onPhysicalPrevious();
    });
    loop.addEventListener("state", (ev) => {
      update(ev.detail.phrase);
    });
    loop.addEventListener("session-stop", () => {
      plugin.stopSession().catch(() => {});
    });
  }

  await update(phrase);
  return true;
}
