import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");
const www = join(root, "www");

const phrasesPath = join(repo, "phrases.json");
if (!existsSync(phrasesPath)) {
  throw new Error("phrases.json manquant");
}
const phrases = JSON.parse(readFileSync(phrasesPath, "utf8"));
if (!Array.isArray(phrases) || !phrases.length) {
  throw new Error("phrases.json vide ou invalide");
}
mkdirSync(join(repo, "js"), { recursive: true });
writeFileSync(
  join(repo, "js", "phrases-data.js"),
  `export const PHRASES = ${JSON.stringify(phrases)};\n`,
  "utf8",
);

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

const files = [
  "index.html",
  "manifest.json",
  "phrases.json",
  "phrases.sample.json",
  "css/styles.css",
  "js/app.js",
  "js/audio-cues.js",
  "js/native-tts.js",
  "js/car-media.js",
  "js/commands.js",
  "js/config.js",
  "js/fuzzy.js",
  "js/loop.js",
  "js/media-session.js",
  "js/queue.js",
  "js/storage.js",
  "js/stt.js",
  "js/tts.js",
  "js/wake-lock.js",
  "js/phrases-data.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

for (const rel of files) {
  const from = join(repo, rel);
  if (!existsSync(from)) {
    throw new Error(`Fichier manquant pour le bundle Android : ${rel}`);
  }
  const to = join(www, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

console.log(`www synchronisé (${files.length} fichiers)`);
