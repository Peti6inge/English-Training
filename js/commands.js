/**
 * Voice command detector. Scans the STT buffer (case-insensitive) for:
 * REPEAT MONKEY, OK MONKEY, PREVIOUS MONKEY, NEXT MONKEY, REMIND MONKEY [note]
 */

import { CONFIG } from "./config.js";

const ORDER = ["remind", "repeat", "previous", "next", "ok"];

/**
 * @param {string} buffer
 * @returns {{ type: "OK"|"REPEAT"|"PREVIOUS"|"NEXT"|"REMIND", before: string, after: string, raw: string } | null}
 */
export function detectCommand(buffer) {
  const raw = String(buffer || "").trim();
  if (!raw) return null;

  let best = null;
  for (const name of ORDER) {
    const patterns = CONFIG.COMMANDS.aliases[name] || [];
    for (const pattern of patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      let match;
      while ((match = re.exec(raw))) {
        const index = match.index;
        if (!best || index > best.index) {
          best = {
            type: name.toUpperCase(),
            index,
            length: match[0].length,
            match: match[0],
          };
        }
      }
    }
  }

  if (!best) return null;

  const before = raw.slice(0, best.index).trim();
  const after = raw.slice(best.index + best.length).trim();
  return { type: best.type, before, after, raw };
}

/** Remove command words so remaining text can be scored against phrase.en */
export function stripCommands(buffer) {
  let text = String(buffer || "");
  for (const patterns of Object.values(CONFIG.COMMANDS.aliases)) {
    for (const pattern of patterns) {
      text = text.replace(pattern, " ");
    }
  }
  return text.replace(/\s+/g, " ").trim();
}
