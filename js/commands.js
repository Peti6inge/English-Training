/**
 * Voice command detector. Commands must appear at the end of the utterance.
 * Phase filters which commands are accepted (listening vs correction).
 */

import { CONFIG } from "./config.js";

const ORDER = ["dont_remind", "repeat_english", "repeat_french", "previous", "next", "remind", "stop"];

const TYPE_MAP = {
  dont_remind: "DONT_REMIND",
  repeat_english: "REPEAT_ENGLISH",
  repeat_french: "REPEAT_FRENCH",
  previous: "PREVIOUS",
  next: "NEXT",
  remind: "REMIND",
  stop: "STOP",
};

/** @param {"listening"|"correction"} phase */
function allowedForPhase(phase) {
  const key = phase === "correction" ? "correction" : "listening";
  return new Set(CONFIG.COMMANDS[key] || []);
}

/**
 * @param {string} buffer
 * @param {{ phase?: "listening"|"correction" }} [opts]
 * @returns {{ type: string, before: string, after: string, raw: string } | null}
 */
export function detectCommand(buffer, opts = {}) {
  const raw = String(buffer || "").trim();
  if (!raw) return null;
  const allowed = allowedForPhase(opts.phase || "listening");

  for (const name of ORDER) {
    const type = TYPE_MAP[name];
    if (!allowed.has(type)) continue;
    const patterns = CONFIG.COMMANDS.aliases[name] || [];
    for (const pattern of patterns) {
      const flags = pattern.flags.replace("g", "");
      const re = new RegExp(`(?:${pattern.source})\\s*$`, flags);
      const match = raw.match(re);
      if (!match) continue;
      const index = match.index ?? raw.length - match[0].length;
      return {
        type,
        before: raw.slice(0, index).trim(),
        after: "",
        raw,
      };
    }
  }

  return null;
}

/** Remove trailing command words so remaining text can be scored against phrase.en */
export function stripCommands(buffer) {
  let text = String(buffer || "").trim();
  for (const name of ORDER) {
    const patterns = CONFIG.COMMANDS.aliases[name] || [];
    for (const pattern of patterns) {
      const flags = pattern.flags.replace("g", "");
      const re = new RegExp(`(?:${pattern.source})\\s*$`, flags);
      text = text.replace(re, " ").trim();
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

export const CORRECTION_COMMAND_LABELS = [
  { label: "Réécouter le français", code: "REPEAT FRENCH" },
  { label: "Écouter l'anglais", code: "REPEAT ENGLISH" },
  { label: "Phrase suivante", code: "NEXT" },
  { label: "Phrase précédente", code: "PREVIOUS" },
  { label: "Ajouter aux révisions", code: "REMIND" },
  { label: "Retirer des révisions", code: "DON'T REMIND" },
  { label: "Arrêter la session", code: "STOP" },
];

export const LISTENING_COMMAND_LABELS = [
  { label: "Réécouter le français", code: "REPEAT FRENCH" },
  { label: "Valider la tentative", code: "NEXT" },
  { label: "Arrêter la session", code: "STOP" },
];
