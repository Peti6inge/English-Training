/**
 * Study direction: which language is the prompt vs the expected spoken answer.
 * UI locale follows direction — fr-en ⇒ French UI, en-fr ⇒ English UI.
 */

import { CONFIG } from "./config.js";

export const STUDY_DIRECTION = Object.freeze({
  FR_EN: "fr-en",
  EN_FR: "en-fr",
});

let _direction = STUDY_DIRECTION.FR_EN;

export function getStudyDirection() {
  return _direction;
}

export function setStudyDirection(direction) {
  _direction =
    direction === STUDY_DIRECTION.EN_FR ? STUDY_DIRECTION.EN_FR : STUDY_DIRECTION.FR_EN;
}

export function isEnToFr() {
  return _direction === STUDY_DIRECTION.EN_FR;
}

/** BCP-47 for Web Speech + native fallbacks (language of the expected answer). */
export function getAnswerSttLang() {
  return isEnToFr() ? "fr-FR" : "en-US";
}

export function getPromptLang() {
  return isEnToFr() ? "en" : "fr";
}

export function getAnswerLang() {
  return isEnToFr() ? "fr" : "en";
}

export function phrasePrompt(phrase) {
  return phrase?.[getPromptLang()] || "";
}

export function phraseAnswer(phrase) {
  return phrase?.[getAnswerLang()] || "";
}

export function repeatPromptCommand() {
  return isEnToFr() ? "REPEAT_ENGLISH" : "REPEAT_FRENCH";
}

export function repeatAnswerCommand() {
  return isEnToFr() ? "REPEAT_FRENCH" : "REPEAT_ENGLISH";
}

/** WASM / Web Speech profile for the current answer language. */
export function getSttProfile() {
  if (isEnToFr()) {
    return {
      lang: "fr-FR",
      whisperModel: CONFIG.STT.whisperModelFr,
      voskModelUrls: CONFIG.STT.voskModelUrlsFr,
    };
  }
  return {
    lang: CONFIG.STT.lang,
    whisperModel: CONFIG.STT.whisperModel,
    voskModelUrls: CONFIG.STT.voskModelUrls,
  };
}

/** UI locale key: mirrors study direction (French UI when learning toward English, etc.). */
export function getUiLocale() {
  return isEnToFr() ? "en" : "fr";
}