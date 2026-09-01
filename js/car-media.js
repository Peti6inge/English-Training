/**
 * Native Android Auto / MediaSession bridge (Capacitor).
 * No-op in the browser PWA.
 */

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

  const update = async (nextPhrase) => {
    try {
      await plugin.updateMetadata({
        title: nextPhrase?.fr || "English Training",
        artist: "English Training · session",
      });
    } catch {
      /* native session may already be stopped */
    }
  };

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

  await update(phrase);
  return true;
}
