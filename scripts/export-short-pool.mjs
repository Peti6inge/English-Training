#!/usr/bin/env node
/**
 * Export isolated pool: N shortest English phrases from phrases.json → data/pools/
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const COUNT = 300;
const POOL_NAME = "short-300";

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const phrases = JSON.parse(readFileSync(join(root, "phrases.json"), "utf8"));

const ranked = phrases
  .map((p) => ({ ...p, enWords: wordCount(p.en) }))
  .sort((a, b) => a.enWords - b.enWords || a.id.localeCompare(b.id));

const top = ranked.slice(0, COUNT);

const byWords = {};
const byTag = {};
for (const p of top) {
  byWords[p.enWords] = (byWords[p.enWords] || 0) + 1;
  const tag = (p.tags && p.tags[0]) || "unknown";
  byTag[tag] = (byTag[tag] || 0) + 1;
}

const poolDir = join(root, "data", "pools");
mkdirSync(poolDir, { recursive: true });

const exportPhrases = top.map((p, i) => ({
  id: `s${String(i + 1).padStart(3, "0")}`,
  fr: p.fr,
  en: p.en,
  tags: p.tags,
}));

const meta = {
  name: POOL_NAME,
  description:
    "300 phrases avec le moins de mots (version anglaise), export depuis phrases.json",
  source: "phrases.json",
  exportedAt: new Date().toISOString(),
  count: COUNT,
  enWordCount: { min: top[0].enWords, max: top[COUNT - 1].enWords },
  distribution: {
    byEnWordCount: Object.fromEntries(
      Object.keys(byWords)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => [k, byWords[k]])
    ),
    byTag: Object.fromEntries(Object.entries(byTag).sort((a, b) => b[1] - a[1])),
  },
  sourceIds: top.map((p) => p.id),
};

writeFileSync(join(poolDir, `${POOL_NAME}.json`), `${JSON.stringify(exportPhrases, null, 2)}\n`, "utf8");
writeFileSync(join(poolDir, `${POOL_NAME}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

console.log(`Exported ${COUNT} phrases → data/pools/${POOL_NAME}.json`);
console.log(JSON.stringify(meta.distribution, null, 2));
