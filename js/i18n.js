/**
 * Minimal UI strings for French / English app locales.
 */

import { getUiLocale, isEnToFr } from "./study-mode.js";

const STRINGS = {
  fr: {
    htmlLang: "fr",
    title: "English Training",
    start: "Démarrer",
    stop: "Stop",
    previous: "Previous",
    next: "Next",
    dontRemind: "Don't remind",
    seen: "Nombre de phrases vues",
    validated: "Nombre de phrases validées",
    reset: "Réinitialiser",
    resetConfirm: "Effacer la progression locale ?",
    importConfirm: "Remplacer toute la progression locale par ce fichier ?",
    export: "export",
    import: "import",
    legacy: "Mode legacy",
    modern: "Mode principal",
    langToggle: "Mode anglais",
    langToggleAria: "Passer en mode anglais (prompt anglais, réponse française)",
    phrasePrompt: "Phrase française",
    phraseAnswer: "Phrase anglaise",
    transcriptIdle: "Le transcript vocal apparaîtra ici.",
    pressStart: "Appuyez sur Démarrer",
    commandsTitleListening:
      "Pendant la saisie — Next / Previous volant uniquement",
    commandsTitleCorrection:
      "Après correction — commande vocale + Previous volant (suivant) ou Next (remind)",
    cmdValidate: "Valider la tentative",
    cmdStop: "Arrêter la session",
    cmdVoiceCorrection: "Commande vocale (immédiate)",
    cmdNextPrev: "Phrase suivante (Previous volant seul)",
    cmdRemindNext: "Remind + phrase suivante",
    repeatPromptListening: "Répéter le français",
    repeatPromptListeningCode: "PREVIOUS (volant / bouton) ou REPEAT FRENCH (voix)",
    repeatPrev: "Phrase précédente",
    micCues: "Bips micro",
    micCuesHint: "Sons d'ouverture/fermeture du micro (flux média, audible en voiture)",
    settings: "Réglages",
    progress: "Progression",
    seenShort: "vues",
    correctShort: "correctes",
    reviewShort: "à revoir",
    dontRemindShort: "don't remind",
    voiceCommands: "Commandes vocales",
    dontRemindList: "Liste Don't Remind",
    noDontRemind: "Aucune phrase en don't remind.",
    reveal: "Voir l'anglais",
    repeatFr: "Repeat French",
    repeatEn: "Repeat English",
    remind: "Remind",
    dontRemindBtn: "Don't Remind",
    init: "Initialisation",
    sttOverlay: "Préparation de Vosk / Whisper. Sur téléphone, le STT natif est utilisé à la place.",
    feedbackValidated: "Validé",
    similarity: "similarité",
    youSaid: "Vous",
    expected: "Attendu",
    hintOk:
      "Perfect — puis commande vocale, Previous volant pour continuer, ou Next pour remind.",
    hintBad:
      "Correction lue — puis commande vocale, Previous volant pour continuer, ou Next pour remind.",
    langSwitchBlocked: "Arrêtez la session avant de changer de langue.",
    overlayWasm: "Chargement WASM",
    sttKicker: "Moteur STT",
  },
  en: {
    htmlLang: "en",
    title: "French Training",
    start: "Start",
    stop: "Stop",
    previous: "Previous",
    next: "Next",
    dontRemind: "Don't remind",
    seen: "Phrases seen",
    validated: "Phrases mastered",
    reset: "Reset",
    resetConfirm: "Clear all local progress?",
    importConfirm: "Replace all local progress with this file?",
    export: "export",
    import: "import",
    legacy: "Legacy mode",
    modern: "Main mode",
    langToggle: "French mode",
    langToggleAria: "Switch to French mode (French prompt, English answer)",
    phrasePrompt: "English phrase",
    phraseAnswer: "French phrase",
    transcriptIdle: "Your spoken transcript will appear here.",
    pressStart: "Press Start",
    commandsTitleListening: "While answering — steering Next / Previous only",
    commandsTitleCorrection:
      "After correction — voice command, Previous (next phrase) or Next (remind)",
    cmdValidate: "Submit attempt",
    cmdStop: "Stop session",
    cmdVoiceCorrection: "Voice command (immediate)",
    cmdNextPrev: "Next phrase (Previous button only)",
    cmdRemindNext: "Remind + next phrase",
    repeatPromptListening: "Repeat English",
    repeatPromptListeningCode: "PREVIOUS (wheel / button) or REPEAT ENGLISH (voice)",
    repeatPrev: "Previous phrase",
    micCues: "Mic beeps",
    micCuesHint: "Open/close mic sounds (media channel, audible in the car)",
    settings: "Settings",
    progress: "Progress",
    seenShort: "seen",
    correctShort: "correct",
    reviewShort: "to review",
    dontRemindShort: "don't remind",
    voiceCommands: "Voice commands",
    dontRemindList: "Don't remind list",
    noDontRemind: "No phrases on don't remind.",
    reveal: "Show French",
    repeatFr: "Repeat French",
    repeatEn: "Repeat English",
    remind: "Remind",
    dontRemindBtn: "Don't Remind",
    init: "Starting",
    sttOverlay:
      "Loading Vosk / Whisper. On phones, native STT is used instead.",
    feedbackValidated: "Validated",
    similarity: "similarity",
    youSaid: "You",
    expected: "Expected",
    hintOk:
      "Perfect — then a voice command, Previous to continue, or Next to remind.",
    hintBad:
      "Correction played — then a voice command, Previous to continue, or Next to remind.",
    langSwitchBlocked: "Stop the session before switching language.",
    overlayWasm: "Loading WASM",
    sttKicker: "STT engine",
  },
};

export function t(key) {
  const loc = getUiLocale();
  return STRINGS[loc]?.[key] ?? STRINGS.fr[key] ?? key;
}

export function getCommandLabels(phase) {
  const loc = getUiLocale();
  const s = STRINGS[loc];
  if (phase === "correction") {
    return [
      { label: s.cmdVoiceCorrection, code: isEnToFr() ? "e.g. REPEAT FRENCH" : "e.g. REPEAT FRENCH" },
      { label: s.cmdNextPrev, code: "PREVIOUS (wheel / button)" },
      { label: s.cmdRemindNext, code: "NEXT (wheel / button)" },
      { label: s.cmdStop, code: "STOP" },
    ];
  }
  return [
    { label: s.cmdValidate, code: "NEXT (wheel / button or voice)" },
    { label: s.repeatPromptListening, code: s.repeatPromptListeningCode },
    { label: s.repeatPrev, code: "PREVIOUS (voice)" },
  ];
}

/** Push stored strings into static DOM (call after study direction changes). */
export function applyStaticI18n() {
  const loc = getUiLocale();
  document.documentElement.lang = STRINGS[loc].htmlLang;
  document.title = STRINGS[loc].title;

  const map = [
    ["ui-start", "start"],
    ["ui-stop", "stop"],
    ["ui-prev", "previous"],
    ["ui-next", "next"],
    ["ui-dont-remind", "dontRemind"],
    ["ui-reset", "reset"],
    ["ui-export", "export"],
    ["ui-import", "import"],
    ["ui-legacy", "legacy"],
    ["ui-modern", "modern"],
    ["ui-lang-toggle", "langToggle"],
    ["ui-lang-toggle-legacy", "langToggle"],
    ["btn-start", "start"],
    ["btn-stop", "stop"],
    ["btn-prev", "previous"],
    ["btn-next", "next"],
    ["btn-repeat-fr", "repeatFr"],
    ["btn-repeat-en", "repeatEn"],
    ["btn-remind", "remind"],
    ["btn-dont-remind", "dontRemindBtn"],
    ["btn-reveal", "reveal"],
    ["btn-reset", "reset"],
  ];

  for (const [id, key] of map) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  }

  const langBtn = document.getElementById("ui-lang-toggle");
  if (langBtn) langBtn.setAttribute("aria-label", t("langToggleAria"));

  const legacyBrand = document.querySelector(".brand h1");
  if (legacyBrand) legacyBrand.textContent = t("title");

  const transcript = document.getElementById("transcript");
  if (transcript && !transcript.querySelector("strong")) {
    transcript.textContent = t("transcriptIdle");
  }

  const phraseFr = document.getElementById("phrase-fr");
  if (phraseFr && phraseFr.dataset.idle === "1") phraseFr.textContent = t("pressStart");

  const overlayKicker = document.querySelector("#overlay .kicker");
  if (overlayKicker) overlayKicker.textContent = t("sttKicker");

  const overlayTitle = document.querySelector("#overlay h2");
  if (overlayTitle) overlayTitle.textContent = t("overlayWasm");

  const overlayMsg = document.getElementById("overlay-msg");
  if (overlayMsg && !overlayMsg.dataset.activeLoad) {
    overlayMsg.textContent = t("sttOverlay");
  }

  updateStatsLabels();
}

export function updateStatsLabels() {
  const loc = getUiLocale();
  const s = STRINGS[loc];
  const meta = document.getElementById("ui-idle-meta");
  if (meta) {
    const ps = meta.querySelectorAll("p");
    if (ps[0]) {
      ps[0].innerHTML = `${s.seen} = <span id="ui-seen">${document.getElementById("ui-seen")?.textContent || "0"}</span>/<span id="ui-total-seen">${document.getElementById("ui-total-seen")?.textContent || "0"}</span>`;
    }
    if (ps[1]) {
      ps[1].innerHTML = `${s.validated} = <span id="ui-validated">${document.getElementById("ui-validated")?.textContent || "0"}</span>/<span id="ui-total-validated">${document.getElementById("ui-total-validated")?.textContent || "0"}</span>`;
    }
  }

  const statSpans = document.querySelectorAll(".stats .stat span");
  const shorts = [s.seenShort, s.correctShort, s.reviewShort, s.dontRemindShort];
  statSpans.forEach((el, i) => {
    if (shorts[i]) el.textContent = shorts[i];
  });

  const kickers = document.querySelectorAll("aside .kicker");
  for (const el of kickers) {
    const text = el.textContent?.trim() || "";
    if (text === "Progression" || text === "Progress") el.textContent = s.progress;
    if (text.startsWith("Commandes") || text.startsWith("Voice")) el.textContent = s.voiceCommands;
    if (text.startsWith("Réglages") || text === "Settings") el.textContent = s.settings;
    if (text.includes("Don't Remind") || text.includes("don't remind")) el.textContent = s.dontRemindList;
  }

  const micLabel = document.querySelector("#setting-mic-cues")?.closest("label");
  if (micLabel) {
    const strong = micLabel.querySelector("strong");
    const small = micLabel.querySelector("small");
    if (strong) strong.textContent = s.micCues;
    if (small) small.textContent = s.micCuesHint;
  }
}