import { LOOP_STATES } from "./config.js";
import { storage } from "./storage.js";
import { tts } from "./tts.js";
import { stt } from "./stt.js";
import { queue } from "./queue.js";
import { loop } from "./loop.js";
import { audioCues } from "./audio-cues.js";
import { wakeLock } from "./wake-lock.js";
import { CORRECTION_COMMAND_LABELS, LISTENING_COMMAND_LABELS } from "./commands.js";
import { initMediaSession } from "./media-session.js";
import { initNativeCarMedia, isNativeAndroid, setNativeMediaRelay, openNotificationAccess } from "./car-media.js";

const $ = (id) => document.getElementById(id);
const STATES = [
  LOOP_STATES.SPEAKING_FR,
  LOOP_STATES.LISTENING,
  LOOP_STATES.EVALUATING,
  LOOP_STATES.FEEDBACK,
  LOOP_STATES.CORRECTION,
  LOOP_STATES.NEXT_PHRASE,
];

function log(message) {
  const el = $("log");
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  el.textContent = `${line}\n${el.textContent}`.slice(0, 1200);
}

function renderMachine(state) {
  $("machine").innerHTML = STATES.map((s) => {
    const active = s === state ? " active" : "";
    return `<span class="step${active}">${s.replaceAll("_", " ")}</span>`;
  }).join("");
}

function renderCommandList(state) {
  const labels = state === LOOP_STATES.CORRECTION ? CORRECTION_COMMAND_LABELS : LISTENING_COMMAND_LABELS;
  const title =
    state === LOOP_STATES.CORRECTION
      ? "Après correction — commande vocale + Next volant"
      : "Pendant la saisie — Next / Previous volant uniquement";
  $("commands-title").textContent = title;
  $("commands").innerHTML = labels
    .map(
      (item) => `
    <div class="cmd"><span>${item.label}</span><code>${item.code}</code></div>`,
    )
    .join("");
}

function renderPhrase(phrase, state = LOOP_STATES.IDLE) {
  if (!phrase) return;
  const showEn = state === LOOP_STATES.FEEDBACK || state === LOOP_STATES.CORRECTION;
  $("phrase-kicker").textContent = showEn ? "Phrase anglaise" : "Phrase française";
  $("phrase-fr").textContent = showEn ? phrase.en : phrase.fr;
  $("phrase-index").textContent = queue.isInterlude()
    ? `rappel · ${queue.indexOfCurrent() + 1} / ${queue.ids.length}`
    : `${queue.indexOfCurrent() + 1} / ${queue.ids.length}`;
  const onRemind = queue.isInterlude() || storage.getRemindList().some((item) => item.phraseId === phrase.id);
  $("phrase-tag").textContent = onRemind ? "remind" : (phrase.tags && phrase.tags[0]) || "phrase";
  $("reveal").hidden = true;
  $("reveal").textContent = phrase.en;
}

function renderStats() {
  const s = queue.stats();
  $("stat-seen").textContent = s.seen;
  $("stat-ok").textContent = s.correct;
  $("stat-bad").textContent = s.incorrect;
  $("stat-remind").textContent = s.remind;

  const list = storage.getRemindList();
  const byId = new Map(queue.phrases.map((p) => [p.id, p]));
  $("remind-list").innerHTML = list.length
    ? list
        .map((item) => {
          const p = byId.get(item.phraseId);
          const note = item.note ? ` — ${item.note}` : "";
          return `<li>${p ? p.fr : item.phraseId}${note}</li>`;
        })
        .join("")
    : "<li>Aucune phrase prioritaire.</li>";
}

function setBadge(kind, label) {
  const badge = $("engine-badge");
  badge.className = `badge ${kind}`;
  $("engine-label").textContent = label;
}

function renderFeedback({ ok, score, spoken, phrase, phase }) {
  const el = $("feedback");
  if (phase !== "validated") {
    el.className = "feedback";
    el.innerHTML = "";
    return;
  }
  el.className = `feedback show ${ok ? "ok" : "bad"}`;
  const pct = Math.round((score || 0) * 100);
  el.innerHTML = `
    <strong>Validé</strong>
    · similarité ${pct}%
    <div>Vous : ${spoken || "—"}</div>
    <div>Attendu : ${phrase.en}</div>
    <div class="meter"><span style="width:${pct}%;background:${ok ? "var(--ok)" : "var(--bad)"}"></span></div>
    <div class="hint">${ok ? "Perfect — puis commande + Next volant, ou Next seul pour continuer." : "Correction lue — puis commande + Next volant, ou Next seul."}</div>
  `;
}

function clearFeedback() {
  const el = $("feedback");
  el.className = "feedback";
  el.innerHTML = "";
}

function renderSettings() {
  const settings = storage.getSettings();
  $("setting-mic-cues").checked = settings.micCues;
  $("setting-media-relay").checked = settings.mediaRelay;
  $("setting-media-relay-row").hidden = !isNativeAndroid();
  const note = $("wake-lock-note");
  note.textContent = wakeLock.supported
    ? "Écran actif automatiquement pendant une session (Wake Lock)."
    : "Wake Lock non supporté sur ce navigateur — la veille peut interrompre la session.";
}

async function loadPhrases() {
  try {
    const mod = await import("./phrases-data.js");
    if (Array.isArray(mod.PHRASES) && mod.PHRASES.length) {
      return { data: mod.PHRASES, url: "./phrases-data.js" };
    }
  } catch {
    /* generated module absent on some web deploys — try JSON next */
  }

  const urls = [
    new URL("../phrases.json", import.meta.url).href,
    new URL("../phrases.sample.json", import.meta.url).href,
    "./phrases.json",
    "./phrases.sample.json",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) return { data, url };
    } catch {
      /* try next source */
    }
  }
  throw new Error("Aucune liste de phrases disponible");
}

async function boot() {
  renderMachine(LOOP_STATES.IDLE);
  renderCommandList(LOOP_STATES.IDLE);
  await storage.init();

  wakeLock.init(() => {
    loop.resumeAfterBackground();
    log("Retour au premier plan — reprise du micro");
  });
  renderSettings();

  try {
    const { data: phrases, url: phrasesSource } = await loadPhrases();
    queue.load(phrases);
    renderPhrase(queue.current());
    renderStats();
    log(`${phrases.length} phrases chargées (${phrasesSource})`);
  } catch (err) {
    log(err.message || String(err));
    setBadge("error", "Liste de phrases vide");
  }

  try {
    await tts.init();
    if (tts.available) log(tts._native ? "Synthèse vocale Android active" : "Synthèse vocale Web active");
    else log("Synthèse vocale indisponible sur cet appareil");
  } catch (err) {
    log(`TTS: ${err.message || String(err)}`);
  }

  stt.addEventListener("status", (ev) => {
    const { status, engine, message, ratio } = ev.detail;
    const blockingLoad = status === "loading-wasm" && !stt._listening;
    $("overlay").classList.toggle("show", blockingLoad);
    $("overlay").hidden = !blockingLoad;
    $("overlay").setAttribute("aria-hidden", blockingLoad ? "false" : "true");
    const pct = ratio != null ? ` (${Math.round(ratio * 100)}%)` : "";
    $("overlay-msg").textContent = `${message || "Chargement…"}${pct}`;
    if (status === "loading-wasm") setBadge("loading", `${message || "WASM…"}${pct}`);
    else if (status === "ready") setBadge("ready", `${engine} prêt`);
    else if (status === "fallback") setBadge("listen", `${engine} actif`);
    else if (status === "error") setBadge("error", "STT indisponible");
    if (message) log(`${message}${pct}`);
  });

  stt.addEventListener("log", (ev) => log(ev.detail.message));
  stt.addEventListener("listening", (ev) => {
    if (ev.detail.listening) setBadge("listen", `${stt.engine} · écoute`);
  });

  loop.addEventListener("state", (ev) => {
    renderMachine(ev.detail.state);
    renderPhrase(ev.detail.phrase, ev.detail.state);
    renderCommandList(ev.detail.state);
    if (ev.detail.state === LOOP_STATES.LISTENING) {
      setBadge("listen", `${stt.engine} · micro ouvert`);
      clearFeedback();
    }
    if (ev.detail.state === LOOP_STATES.CORRECTION) {
      setBadge("listen", `${stt.engine} · correction`);
    }
    renderStats();
  });

  loop.addEventListener("transcript", (ev) => {
    const partial = ev.detail.partial ? ` <em>${ev.detail.partial}</em>` : "";
    $("transcript").innerHTML = `<strong>${ev.detail.buffer || "…"}</strong>${partial}`;
  });

  loop.addEventListener("feedback", (ev) => {
    renderFeedback(ev.detail);
    renderStats();
  });

  loop.addEventListener("correction", () => {
    renderCommandList(LOOP_STATES.CORRECTION);
  });

  loop.addEventListener("remind", () => {
    renderStats();
    log("Phrase ajoutée à customRemindList");
  });

  loop.addEventListener("dont-remind", () => {
    renderStats();
    log("Phrase retirée de customRemindList");
  });

  loop.addEventListener("session-stop", () => {
    $("btn-start").disabled = false;
    $("btn-stop").disabled = true;
    setBadge("ready", `${stt.engine} en pause`);
  });

  $("btn-start").addEventListener("click", async () => {
    $("btn-start").disabled = true;
    $("btn-stop").disabled = false;
    try {
      const nativeOk = await initNativeCarMedia(loop, {
        onLog: log,
        mediaRelay: storage.getSettings().mediaRelay,
      });
      const mediaOk = nativeOk ? false : initMediaSession(loop);
      if (nativeOk) log("Pont Android Auto / MediaSession natif actif");
      else if (mediaOk) log("Touches média volant actives (Next / Previous)");
      await stt.init();
      await loop.start();
    } catch (err) {
      log(err.message || String(err));
      setBadge("error", "Micro refusé");
      $("btn-start").disabled = false;
      $("btn-stop").disabled = true;
    }
  });

  $("btn-stop").addEventListener("click", async () => {
    await loop.trigger("STOP");
  });

  $("btn-repeat-fr").addEventListener("click", () => loop.trigger("REPEAT_FRENCH"));
  $("btn-repeat-en").addEventListener("click", () => loop.trigger("REPEAT_ENGLISH"));
  $("btn-prev").addEventListener("click", () => loop.onPhysicalPrevious());
  $("btn-next").addEventListener("click", () => loop.onPhysicalNext());
  $("btn-remind").addEventListener("click", () => loop.trigger("REMIND"));
  $("btn-dont-remind").addEventListener("click", () => loop.trigger("DONT_REMIND"));
  $("btn-reveal").addEventListener("click", () => {
    $("reveal").hidden = false;
  });
  $("btn-reset").addEventListener("click", () => {
    if (!confirm("Effacer la progression locale ?")) return;
    storage.resetProgress();
    queue.rebuild();
    renderPhrase(queue.current());
    renderStats();
  });

  $("setting-mic-cues").addEventListener("change", (ev) => {
    storage.setSettings({ micCues: ev.target.checked });
    if (ev.target.checked) audioCues.micOn();
  });

  $("setting-media-relay").addEventListener("change", async (ev) => {
    const enabled = ev.target.checked;
    storage.setSettings({ mediaRelay: enabled });
    if (!isNativeAndroid()) return;
    const status = await setNativeMediaRelay(enabled);
    if (enabled && !status.notificationListener) {
      log("Autorisez l'accès aux notifications, puis relancez une session");
      await openNotificationAccess();
    } else if (enabled) {
      log("Relais commodo via Spotify activé");
    } else {
      log("Relais commodo désactivé");
    }
  });

  if ("serviceWorker" in navigator && !isNativeAndroid()) {
    try {
      await navigator.serviceWorker.register("./sw.js");
      log("Service worker enregistré");
    } catch (err) {
      log(`SW: ${err.message}`);
    }
  }
}

boot().catch((err) => {
  console.error(err);
  log(err.message || String(err));
});
