/**
 * Voice command detector. Commands must appear at the end of the utterance.
 * Most-specific patterns are tried first so "don't remind" wins over "remind".
 */

import { CONFIG } from "./config.js";

const ORDER = ["dont_remind", "repeat_english", "repeat_french", "previous", "next", "remind"];

const TYPE_MAP = {
  dont_remind: "DONT_REMIND",
  repeat_english: "REPEAT_ENGLISH",
  repeat_french: "REPEAT_FRENCH",
  previous: "PREVIOUS",
  next: "NEXT",
  remind: "REMIND",
};

/**
 * @param {string} buffer
 * @returns {{ type: string, before: string, after: string, raw: string } | null}
 */
export function detectCommand(buffer) {
  const raw = String(buffer || "").trim();
  if (!raw) return null;

  for (const name of ORDER) {
    const patterns = CONFIG.COMMANDS.aliases[name] || [];
    for (const pattern of patterns) {
      const flags = pattern.flags.replace("g", "");
      const re = new RegExp(`(?:${pattern.source})\\s*$`, flags);
      const match = raw.match(re);
      if (!match) continue;
      const index = match.index ?? raw.length - match[0].length;
      return {
        type: TYPE_MAP[name],
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
