/**
 * Android native microphone bridge (Capacitor `NativeMic`). No-op in browser.
 *
 * Why: the WebView's getUserMedia puts Android in MODE_IN_COMMUNICATION and opens a
 * Bluetooth SCO link to the car (HFP). The Clio then treats the session as a phone
 * call: steering-wheel Next/Previous stop being sent as AVRCP media keys and audio
 * drops to the 8 kHz SCO channel. Native AudioRecord(VOICE_RECOGNITION) never does that.
 */

function plugin() {
  const cap = globalThis.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.NativeMic ?? null;
}

function base64ToFloat32(b64) {
  const bin = atob(b64);
  const len = bin.length >> 1;
  const out = new Float32Array(len);
  for (let i = 0, j = 0; i < len; i++, j += 2) {
    let sample = bin.charCodeAt(j) | (bin.charCodeAt(j + 1) << 8);
    if (sample >= 0x8000) sample -= 0x10000;
    out[i] = sample / 32768;
  }
  return out;
}

export function getNativeMic() {
  const p = plugin();
  if (!p) return null;
  let pcmHandle = null;
  let errorHandle = null;
  return {
    sampleRate: 16000,
    async start() {
      const state = await p.start();
      if (state?.sampleRate) this.sampleRate = state.sampleRate;
      return state;
    },
    pause() {
      return p.pause().catch(() => {});
    },
    resume() {
      return p.resume().catch(() => {});
    },
    async stop() {
      await this.offPcm();
      try {
        await p.stop();
      } catch {
        /* already stopped */
      }
    },
    async onPcm(onChunk, onError) {
      await this.offPcm();
      pcmHandle = await p.addListener("pcm", (payload) => {
        if (!payload?.data) return;
        onChunk(base64ToFloat32(payload.data), payload.sampleRate || this.sampleRate);
      });
      if (typeof onError === "function") {
        errorHandle = await p.addListener("error", (payload) => onError(payload?.message || "micro natif"));
      }
    },
    async offPcm() {
      const handles = [pcmHandle, errorHandle];
      pcmHandle = null;
      errorHandle = null;
      for (const handle of handles) {
        try {
          await handle?.remove?.();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
