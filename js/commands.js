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

/** Commands recognised when the user presses physical Next during answer capture. */
const LISTENING_PHYSICAL_NEXT = new Set(["REPEAT_FRENCH", "DONT_REMIND", "REMIND"]);

/**
 * Detect a trailing voice command when the user presses physical/UI Next.
 * During listening, NEXT and STOP are ignored (default action = validate attempt).
 * @param {string} buffer
 * @param {{ phase?: "listening"|"correction" }} [opts]
 */
export function detectCommandOnPhysicalNext(buffer, opts = {}) {
  const phase = opts.phase || "listening";
  if (phase === "correction") {
    return detectCommand(buffer, { phase: "correction" });
  }

  const raw = String(buffer || "").trim();
  if (!raw) return null;

  for (const name of ORDER) {
    const type = TYPE_MAP[name];
    if (!LISTENING_PHYSICAL_NEXT.has(type)) continue;
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
  { label: "Commande vocale + Next volant", code: "ex. REPEAT FRENCH" },
  { label: "Phrase suivante (Next volant seul)", code: "NEXT" },
  { label: "Remind + phrase précédente", code: "PREVIOUS (volant / bouton)" },
  { label: "Arrêter la session (Stop + Next)", code: "STOP" },
];

export const LISTENING_COMMAND_LABELS = [
  { label: "Valider la tentative", code: "NEXT (volant / bouton)" },
  { label: "Remind + phrase précédente", code: "PREVIOUS (volant / bouton)" },
  { label: "Réécouter le français (dans la saisie + Next)", code: "REPEAT FRENCH" },
  { label: "Retirer des révisions (dans la saisie + Next)", code: "DON'T REMIND" },
];
