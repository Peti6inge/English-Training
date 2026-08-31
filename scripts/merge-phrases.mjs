#!/usr/bin/env node
/**
 * Merge data/chunks/c*.json → phrases.json
 * Validates length, forbidden endings, dedupes by English text.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chunksDir = join(root, "data", "chunks");
const outPath = join(root, "phrases.json");

const FORBIDDEN_END = /\b(next|stop|previous|remind|repeat(?:\s+(?:the\s+)?(?:french|english))?|dont|don't)\s*$/i;

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function norm(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const chunkFiles = readdirSync(chunksDir)
  .filter((f) => /^c\d+\.json$/.test(f))
  .sort();

const all = [];
for (const file of chunkFiles) {
  const items = JSON.parse(readFileSync(join(chunksDir, file), "utf8"));
  if (!Array.isArray(items)) throw new Error(`${file} must be a JSON array`);
  all.push(...items);
}

const seen = new Set();
const out = [];
const warnings = [];

for (const item of all) {
  const fr = String(item.fr || "").trim();
  const en = String(item.en || "").trim();
  const tag = Array.isArray(item.tags) ? item.tags[0] : item.tags;
  if (!fr || !en || !tag) {
    warnings.push(`skip missing fields: ${JSON.stringify(item).slice(0, 80)}`);
    continue;
  }
  const wc = wordCount(en);
  if (wc < 5 || wc > 15) warnings.push(`length ${wc}: ${en}`);
  if (FORBIDDEN_END.test(en)) warnings.push(`forbidden ending: ${en}`);
  const key = norm(en);
  if (seen.has(key)) {
    warnings.push(`duplicate: ${en}`);
    continue;
  }
  seen.add(key);
  out.push({ fr, en, tags: [tag] });
}

while (out.length > 800) out.pop();
if (out.length < 800) {
  console.warn(`Warning: only ${out.length} unique phrases (target 800)`);
}

const phrases = out.map((p, i) => ({
  id: `p${String(i + 1).padStart(3, "0")}`,
  ...p,
}));

writeFileSync(outPath, `${JSON.stringify(phrases, null, 2)}\n`, "utf8");

console.log(`Merged ${phrases.length} phrases from ${chunkFiles.length} chunks → ${outPath}`);
if (warnings.length) {
  console.log(`\n${warnings.length} warnings (first 15):`);
  warnings.slice(0, 15).forEach((w) => console.log(`  - ${w}`));
}

const vocab = chunkFiles.reduce((n, f) => {
  const items = JSON.parse(readFileSync(join(chunksDir, f), "utf8"));
  return n + items.filter((x) => x.level === "vocab").length;
}, 0);
console.log(`Source mix: ~${vocab} vocab + ~${all.length - vocab} casual in chunks`);
