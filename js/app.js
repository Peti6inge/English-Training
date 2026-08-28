import { LOOP_STATES } from "./config.js";
import { storage } from "./storage.js";
import { tts } from "./tts.js";
import { stt } from "./stt.js";
import { queue } from "./queue.js";
import { loop } from "./loop.js";

const $ = (id) => document.getElementById(id);
const STATES = [
  LOOP_STATES.SPEAKING_FR,
  LOOP_STATES.LISTENING,
  LOOP_STATES.EVALUATING,
  LOOP_STATES.FEEDBACK,
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

function renderPhrase(phrase) {
  if (!phrase) return;
  $("phrase-fr").textContent = phrase.fr;
  $("phrase-index").textContent = `${queue.indexOfCurrent() + 1} / ${queue.ids.length}`;
  $("phrase-tag").textContent = (phrase.tags && phrase.tags[0]) || "phrase";
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

function renderFeedback({ ok, score, spoken, phrase }) {
  const el = $("feedback");
  el.className = `feedback show ${ok ? "ok" : "bad"}`;
  const pct = Math.round((score || 0) * 100);
  el.innerHTML = `
    <strong>${ok ? "Perfect" : "Incorrect"}</strong>
    · similarité ${pct}%
    <div>Vous : ${spoken || "—"}</div>
    <div>Attendu : ${phrase.en}</div>
    <div class="meter"><span style="width:${pct}%;background:${ok ? "var(--ok)" : "var(--bad)"}"></span></div>
  `;
}

async function boot() {
  renderMachine(LOOP_STATES.IDLE);
  await storage.init();
  await tts.init();

  const phrases = await fetch("./phrases.json").then((r) => r.json());
  queue.load(phrases);
  renderPhrase(queue.current());
  renderStats();

  stt.addEventListener("status", (ev) => {
    const { status, engine, message } = ev.detail;
    $("overlay").classList.toggle("show", status === "loading-wasm");
    $("overlay-msg").textContent = message || "Chargement…";
    if (status === "loading-wasm") setBadge("loading", message || "WASM…");
    else if (status === "ready") setBadge("ready", `${engine} prêt`);
    else if (status === "fallback") setBadge("loading", `${engine} (secours)`);
    else if (status === "error") setBadge("error", "STT indisponible");
    if (message) log(message);
  });

  stt.addEventListener("log", (ev) => log(ev.detail.message));
  stt.addEventListener("listening", (ev) => {
    if (ev.detail.listening) setBadge("listen", `${stt.engine} · écoute`);
  });

  loop.addEventListener("state", (ev) => {
    renderMachine(ev.detail.state);
    renderPhrase(ev.detail.phrase);
    if (ev.detail.state === LOOP_STATES.LISTENING) setBadge("listen", `${stt.engine} · écoute`);
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

  loop.addEventListener("remind", () => {
    renderStats();
    log("Phrase ajoutée à customRemindList");
  });

  $("btn-start").addEventListener("click", async () => {
    $("btn-start").disabled = true;
    $("btn-stop").disabled = false;
    $("overlay").classList.add("show");
    try {
      await stt.init();
      await loop.start();
    } catch (err) {
      log(err.message || String(err));
      setBadge("error", "Micro refusé");
      $("btn-start").disabled = false;
      $("btn-stop").disabled = true;
    } finally {
      $("overlay").classList.remove("show");
    }
  });

  $("btn-stop").addEventListener("click", async () => {
    await loop.stop();
    $("btn-start").disabled = false;
    $("btn-stop").disabled = true;
    setBadge("ready", `${stt.engine} en pause`);
  });

  $("btn-repeat").addEventListener("click", () => loop.trigger("REPEAT"));
  $("btn-ok").addEventListener("click", () => loop.trigger("OK", { spoken: stt.getBuffer() }));
  $("btn-prev").addEventListener("click", () => loop.trigger("PREVIOUS"));
  $("btn-next").addEventListener("click", () => loop.trigger("NEXT"));
  $("btn-remind").addEventListener("click", () => loop.trigger("REMIND"));
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

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
      log("Service worker enregistré");
    } catch (err) {
      log(`SW: ${err.message}`);
    }
  }
}

boot();
