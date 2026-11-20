import { LOOP_STATES } from "./config.js";
import { storage } from "./storage.js";
import { tts } from "./tts.js";
import { stt } from "./stt.js";
import { queue } from "./queue.js";
import { loop } from "./loop.js";
import { audioCues } from "./audio-cues.js";
import { wakeLock } from "./wake-lock.js";
import {
  getStudyDirection,
  isEnToFr,
  phraseAnswer,
  phrasePrompt,
  repeatAnswerCommand,
  repeatPromptCommand,
  setStudyDirection,
  STUDY_DIRECTION,
} from "./study-mode.js";
import { applyStaticI18n, getCommandLabels, t } from "./i18n.js";
import { initMediaSession } from "./media-session.js";
import { initNativeCarMedia, holdNativeCarMedia, isNativeAndroid } from "./car-media.js";

const $ = (id) => document.getElementById(id);
const STATES = [
  LOOP_STATES.SPEAKING_FR,
  LOOP_STATES.LISTENING,
  LOOP_STATES.EVALUATING,
  LOOP_STATES.FEEDBACK,
  LOOP_STATES.CORRECTION,
  LOOP_STATES.NEXT_PHRASE,
];

let starting = false;

function log(message) {
  const el = $("log");
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  el.textContent = `${line}\n${el.textContent}`.slice(0, 1200);
}

function applyView(mode) {
  const legacy = mode === "legacy";
  document.body.classList.toggle("view-legacy", legacy);
  document.body.classList.toggle("view-minimal", !legacy);
  $("legacy-view").hidden = !legacy;
  $("minimal-view").hidden = legacy;
  storage.setSettings({ uiMode: legacy ? "legacy" : "minimal" });
}

function renderMachine(state) {
  $("machine").innerHTML = STATES.map((s) => {
    const active = s === state ? " active" : "";
    return `<span class="step${active}">${s.replaceAll("_", " ")}</span>`;
  }).join("");
}

function renderCommandList(state) {
  const labels =
    state === LOOP_STATES.CORRECTION ? getCommandLabels("correction") : getCommandLabels("listening");
  const title =
    state === LOOP_STATES.CORRECTION ? t("commandsTitleCorrection") : t("commandsTitleListening");
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
  const showAnswer = state === LOOP_STATES.FEEDBACK || state === LOOP_STATES.CORRECTION;
  $("phrase-kicker").textContent = showAnswer ? t("phraseAnswer") : t("phrasePrompt");
  $("phrase-fr").textContent = showAnswer ? phraseAnswer(phrase) : phrasePrompt(phrase);
  $("phrase-fr").dataset.idle = state === LOOP_STATES.IDLE ? "1" : "0";
  $("phrase-index").textContent = queue.isInterlude()
    ? `rappel · ${queue.indexOfCurrent() + 1} / ${queue.ids.length}`
    : `${queue.indexOfCurrent() + 1} / ${queue.ids.length}`;
  const blocked = storage.isDontRemind(phrase.id);
  const status = storage.getPhraseState(phrase.id).lastAttemptStatus;
  const onRemind = !blocked && (queue.isInterlude() || status === "correct" || status === "incorrect");
  $("phrase-tag").textContent = blocked
    ? "don't remind"
    : onRemind
      ? "remind"
      : (phrase.tags && phrase.tags[0]) || "phrase";
  $("reveal").hidden = true;
  $("reveal").textContent = phraseAnswer(phrase);

  $("ui-phrase-fr").textContent = phrasePrompt(phrase);
  $("ui-phrase-en").textContent = phraseAnswer(phrase);
  const correction = state === LOOP_STATES.CORRECTION;
  $("ui-phrase-en-wrap").hidden = !correction;
  $("minimal-view").classList.toggle("is-correction", correction);
}

function renderStats() {
  const s = queue.stats();
  $("stat-seen").textContent = s.seen;
  $("stat-ok").textContent = s.correct;
  $("stat-bad").textContent = s.incorrect;
  $("stat-remind").textContent = s.dontRemind;

  $("ui-seen").textContent = s.seen;
  $("ui-total-seen").textContent = s.total;
  $("ui-validated").textContent = s.dontRemind;
  $("ui-total-validated").textContent = s.total;

  const list = storage.getDontRemindList();
  const byId = new Map(queue.phrases.map((p) => [p.id, p]));
  $("remind-list").innerHTML = list.length
    ? list
        .map((item) => {
          const p = byId.get(item.phraseId);
          const label = p ? (isEnToFr() ? p.en : p.fr) : item.phraseId;
          return `<li>${label}</li>`;
        })
        .join("")
    : `<li>${t("noDontRemind")}</li>`;
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
    <strong>${t("feedbackValidated")}</strong>
    · ${t("similarity")} ${pct}%
    <div>${t("youSaid")} : ${spoken || "—"}</div>
    <div>${t("expected")} : ${phraseAnswer(phrase)}</div>
    <div class="meter"><span style="width:${pct}%;background:${ok ? "var(--ok)" : "var(--bad)"}"></span></div>
    <div class="hint">${ok ? t("hintOk") : t("hintBad")}</div>
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
  const note = $("wake-lock-note");
  note.textContent = wakeLock.supported
    ? "Écran actif automatiquement pendant une session (Wake Lock)."
    : "Wake Lock non supporté sur ce navigateur — la veille peut interrompre la session.";
}

function syncSessionUi(state = loop.state) {
  const running = loop.running;
  $("minimal-view").classList.toggle("is-running", running);
  $("btn-start").disabled = running;
  $("btn-stop").disabled = !running;
  $("ui-start").disabled = running;
  $("ui-stop").disabled = !running;
  const dontRemindOk = !running || state === LOOP_STATES.CORRECTION;
  $("ui-dont-remind").disabled = !dontRemindOk;
  $("ui-idle-meta").hidden = running;
  $("ui-export").disabled = running;
  $("ui-import").disabled = running;
  $("ui-lang-toggle").disabled = running;
  const legacyLang = $("ui-lang-toggle-legacy");
  if (legacyLang) legacyLang.disabled = running;
}

function resetProgress() {
  if (!confirm(t("resetConfirm"))) return;
  storage.resetProgress();
  queue.rebuild();
  renderPhrase(queue.current());
  renderStats();
}

const PROGRESS_FILENAME = "english-training-progress.json";

function exportProgress() {
  if (loop.running) return;
  const doc = storage.exportProgressDocument();
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = PROGRESS_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
  log("Progression exportée");
}

async function importProgressFromFile(file) {
  if (!file || loop.running) return;
  let snapshot;
  try {
    const text = await file.text();
    snapshot = storage.parseProgressFile(text);
  } catch (err) {
    alert(err.message || "Import impossible");
    return;
  }
  if (!confirm(t("importConfirm"))) return;
  storage.applySnapshot(snapshot);
  queue.rebuild();
  renderPhrase(queue.current());
  renderStats();
  log("Progression importée");
}

async function startSession() {
  if (loop.running || starting) return;
  starting = true;
  $("btn-start").disabled = true;
  $("ui-start").disabled = true;
  $("btn-stop").disabled = false;
  $("ui-stop").disabled = false;
  try {
    const nativeOk = await initNativeCarMedia(loop, { onLog: log });
    const mediaOk = nativeOk ? false : initMediaSession(loop);
    if (nativeOk) log("Commodos volant reliés à la session");
    else if (mediaOk) log("Touches média volant actives (Next / Previous)");
    await stt.init();
    await loop.start();
    syncSessionUi(loop.state);
  } catch (err) {
    log(err.message || String(err));
    setBadge("error", "Micro refusé");
    $("btn-start").disabled = false;
    $("btn-stop").disabled = true;
    $("ui-start").disabled = false;
    $("ui-stop").disabled = true;
    syncSessionUi(LOOP_STATES.IDLE);
  } finally {
    starting = false;
  }
}

function onDontRemind() {
  if (!loop.running) {
    const phrase = queue.current();
    if (!phrase) return;
    storage.addDontRemind(phrase.id);
    queue.goTo(queue.indexOfCurrent() + 1);
    renderPhrase(queue.current());
    renderStats();
    log("Don't remind (+1 au score SRS)");
    return;
  }
  loop.trigger("DONT_REMIND");
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

function applyStudyDirectionFromSettings() {
  const { studyDirection } = storage.getSettings();
  setStudyDirection(
    studyDirection === STUDY_DIRECTION.EN_FR ? STUDY_DIRECTION.EN_FR : STUDY_DIRECTION.FR_EN,
  );
  applyStaticI18n();
  document.body.dataset.study = getStudyDirection();
}

async function toggleStudyDirection() {
  if (loop.running || starting) {
    alert(t("langSwitchBlocked"));
    return;
  }
  const next =
    getStudyDirection() === STUDY_DIRECTION.FR_EN ? STUDY_DIRECTION.EN_FR : STUDY_DIRECTION.FR_EN;
  storage.setSettings({ studyDirection: next });
  setStudyDirection(next);
  applyStudyDirectionFromSettings();
  try {
    await stt.reconfigureForStudyMode();
  } catch (err) {
    log(err.message || String(err));
  }
  renderPhrase(queue.current(), loop.state);
  renderCommandList(loop.state);
  renderStats();
  log(
    next === STUDY_DIRECTION.EN_FR
      ? "Mode EN→FR — UI anglaise, réponses en français"
      : "Mode FR→EN — UI française, réponses en anglais",
  );
}

async function boot() {
  renderMachine(LOOP_STATES.IDLE);
  await storage.init();
  applyStudyDirectionFromSettings();
  renderCommandList(LOOP_STATES.IDLE);
  applyView(storage.getSettings().uiMode === "legacy" ? "legacy" : "minimal");
  syncSessionUi(LOOP_STATES.IDLE);

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

  if (isNativeAndroid()) {
    try {
      const held = await holdNativeCarMedia(loop, { onLog: log });
      if (held) log("Session média volant active (AVRCP / commodos)");
    } catch (err) {
      log(`Session média: ${err.message || String(err)}`);
    }
  } else {
    initMediaSession(loop);
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
    syncSessionUi(ev.detail.state);
    if (ev.detail.state === LOOP_STATES.LISTENING) {
      setBadge("listen", `${stt.engine} · micro ouvert`);
      clearFeedback();
    }
    if (ev.detail.state === LOOP_STATES.CORRECTION) {
      setBadge("listen", `${stt.engine} · correction`);
    }
    if (ev.detail.state === LOOP_STATES.SPEAKING_FR || ev.detail.state === LOOP_STATES.NEXT_PHRASE) {
      $("ui-transcript").innerHTML = "";
    }
    renderStats();
  });

  loop.addEventListener("transcript", (ev) => {
    const partial = ev.detail.partial ? ` <em>${ev.detail.partial}</em>` : "";
    const html = `<strong>${ev.detail.buffer || "…"}</strong>${partial}`;
    $("transcript").innerHTML = html;
    $("ui-transcript").innerHTML = html;
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
    log("Phrase en Remind (retirée de Don't Remind si besoin)");
  });

  loop.addEventListener("dont-remind", () => {
    renderStats();
    log("Don't remind (+1 au score SRS)");
  });

  loop.addEventListener("session-stop", () => {
    $("btn-start").disabled = false;
    $("btn-stop").disabled = true;
    $("ui-start").disabled = false;
    $("ui-stop").disabled = true;
    $("ui-transcript").innerHTML = "";
    syncSessionUi(LOOP_STATES.IDLE);
    renderPhrase(queue.current(), LOOP_STATES.IDLE);
    setBadge("ready", `${stt.engine} en pause`);
  });

  loop.addEventListener("idle-start", () => {
    startSession();
  });

  $("btn-start").addEventListener("click", () => startSession());
  $("ui-start").addEventListener("click", () => startSession());

  $("btn-stop").addEventListener("click", async () => {
    await loop.trigger("STOP");
  });
  $("ui-stop").addEventListener("click", async () => {
    await loop.trigger("STOP");
  });

  $("btn-repeat-fr").addEventListener("click", () => loop.trigger("REPEAT_FRENCH"));
  $("btn-repeat-en").addEventListener("click", () => loop.trigger("REPEAT_ENGLISH"));
  $("ui-phrase-fr-wrap").addEventListener("click", () => loop.trigger(repeatPromptCommand()));
  $("ui-phrase-en-wrap").addEventListener("click", () => loop.trigger(repeatAnswerCommand()));

  $("ui-lang-toggle").addEventListener("click", () => toggleStudyDirection());
  $("ui-lang-toggle-legacy").addEventListener("click", () => toggleStudyDirection());

  $("btn-prev").addEventListener("click", () => loop.onPhysicalPrevious());
  $("btn-next").addEventListener("click", () => loop.onPhysicalNext());
  $("ui-prev").addEventListener("click", () => loop.onPhysicalPrevious());
  $("ui-next").addEventListener("click", () => loop.onPhysicalNext());

  $("btn-remind").addEventListener("click", () => loop.trigger("REMIND"));
  $("btn-dont-remind").addEventListener("click", () => loop.trigger("DONT_REMIND"));
  $("ui-dont-remind").addEventListener("click", () => onDontRemind());
  $("btn-reveal").addEventListener("click", () => {
    $("reveal").hidden = false;
  });
  $("btn-reset").addEventListener("click", () => resetProgress());
  $("ui-reset").addEventListener("click", () => resetProgress());

  $("ui-export").addEventListener("click", () => exportProgress());
  $("ui-import").addEventListener("click", () => $("ui-import-file").click());
  $("ui-import-file").addEventListener("change", async (ev) => {
    const input = ev.target;
    const file = input.files?.[0];
    input.value = "";
    await importProgressFromFile(file);
  });

  $("ui-legacy").addEventListener("click", () => applyView("legacy"));
  $("ui-modern").addEventListener("click", () => applyView("minimal"));

  $("setting-mic-cues").addEventListener("change", (ev) => {
    storage.setSettings({ micCues: ev.target.checked });
    if (ev.target.checked) audioCues.micOn();
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
