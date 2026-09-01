/**
 * Android native TextToSpeech bridge (Capacitor). No-op in browser.
 */

function plugin() {
  const cap = globalThis.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.NativeTts ?? null;
}

export function getNativeTts() {
  const p = plugin();
  if (!p) return null;
  return {
    async init() {
      await p.init();
    },
    async cancel() {
      try {
        await p.cancel();
      } catch {
        /* ignore */
      }
    },
    speak(text, lang, opts = {}) {
      const utterance = String(text || "").trim();
      if (!utterance) return Promise.resolve();
      return p.speak({
        text: utterance,
        lang,
        rate: opts.rate ?? 0.95,
      });
    },
  };
}
