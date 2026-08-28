/**
 * Standalone string normalization + fuzzy comparison.
 * Primary match: expected keywords appear in order (fillers allowed).
 * Fallback: combined similarity at the configured threshold (default 0.85).
 */

const PUNCT_RE = /[^\p{L}\p{N}\s']/gu;
const MULTI_SPACE_RE = /\s+/g;

const CONTRACTIONS = {
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "what's": "what is",
  "where's": "where is",
  "who's": "who is",
  "how's": "how is",
  "there's": "there is",
  "here's": "here is",
  "let's": "let us",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "can't": "can not",
  cannot: "can not",
  "won't": "will not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "wouldn't": "would not",
  "couldn't": "could not",
  "shouldn't": "should not",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "we'll": "we will",
  "they'll": "they will",
  "he'll": "he will",
  "she'll": "she will",
  "i'd": "i would",
  "you'd": "you would",
  "we'd": "we would",
  "they'd": "they would",
  okay: "ok",
  okey: "ok",
  wanna: "want to",
  gonna: "going to",
  gotta: "got to",
  lemme: "let me",
  u: "you",
  r: "are",
  ur: "your",
  ya: "you",
};

/**
 * Lowercase, expand contractions, strip punctuation, collapse whitespace, optional accent fold.
 * @param {string} input
 * @param {{ foldAccents?: boolean }} [opts]
 */
export function normalize(input, opts = {}) {
  if (!input) return "";
  let text = String(input).normalize("NFKC").toLowerCase();
  if (opts.foldAccents !== false) {
    text = text.normalize("NFD").replace(/\p{M}/gu, "");
  }
  text = text.replace(/\b[\p{L}']+\b/gu, (word) => CONTRACTIONS[word] || word);
  text = text.replace(PUNCT_RE, " ").replace(MULTI_SPACE_RE, " ").trim();
  return text;
}

export function tokenize(input, opts = {}) {
  return normalize(input, opts).split(" ").filter(Boolean);
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > b.length) [a, b] = [b, a];

  const prev = new Array(a.length + 1);
  const curr = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    for (let i = 0; i <= a.length; i++) prev[i] = curr[i];
  }
  return prev[a.length];
}

export function levenshteinSimilarity(a, b) {
  if (!a && !b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

/** Sørensen–Dice on character bigrams. */
export function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const n = counts.get(bg) || 0;
    if (n > 0) {
      counts.set(bg, n - 1);
      overlap += 1;
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export function tokenSortRatio(a, b) {
  const sa = a.split(" ").filter(Boolean).sort().join(" ");
  const sb = b.split(" ").filter(Boolean).sort().join(" ");
  return levenshteinSimilarity(sa, sb);
}

export function tokenSetRatio(a, b) {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (!setA.size && !setB.size) return 1;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

export function tokenSimilarity(a, b) {
  if (a === b) return 1;
  return Math.max(levenshteinSimilarity(a, b), diceCoefficient(a, b));
}

function tokensMatch(spokenToken, expectedToken, wordThreshold) {
  if (spokenToken === expectedToken) return true;
  const shortest = Math.min(spokenToken.length, expectedToken.length);
  if (shortest <= 2) return spokenToken === expectedToken;
  const sim = tokenSimilarity(spokenToken, expectedToken);
  const threshold = shortest <= 4 ? Math.max(wordThreshold, 0.75) : wordThreshold;
  return sim >= threshold;
}

/**
 * True when every expected token appears in order in the spoken text.
 * Extra tokens (fillers / parasites) are ignored. Compound words stay split
 * into their parts and must still occur in sequence.
 *
 * Example: expected "bonjour comment ça va"
 *          spoken   "alors bonjour comment est-ce que ça va"
 *          → match
 *
 * @param {string} spoken
 * @param {string} expected
 * @param {{ foldAccents?: boolean, wordThreshold?: number }} [opts]
 */
export function keywordsInOrder(spoken, expected, opts = {}) {
  const spokenTokens = tokenize(spoken, opts);
  const expectedTokens = tokenize(expected, opts);
  if (!expectedTokens.length) return { ok: true, score: 1, matched: 0, total: 0 };
  if (!spokenTokens.length) return { ok: false, score: 0, matched: 0, total: expectedTokens.length };

  const wordThreshold = opts.wordThreshold ?? 0.72;
  let si = 0;
  let matched = 0;
  for (const want of expectedTokens) {
    let found = false;
    while (si < spokenTokens.length) {
      if (tokensMatch(spokenTokens[si], want, wordThreshold)) {
        found = true;
        si += 1;
        matched += 1;
        break;
      }
      si += 1;
    }
    if (!found) break;
  }

  const total = expectedTokens.length;
  const ok = matched === total;
  return { ok, score: ok ? 1 : matched / total, matched, total };
}

/**
 * Combined similarity in [0, 1].
 * @param {string} spoken
 * @param {string} expected
 * @param {{ foldAccents?: boolean }} [opts]
 */
export function similarity(spoken, expected, opts = {}) {
  const a = normalize(spoken, opts);
  const b = normalize(expected, opts);
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const lev = levenshteinSimilarity(a, b);
  const dice = diceCoefficient(a, b);
  const tokenSort = tokenSortRatio(a, b);
  const tokenSet = tokenSetRatio(a, b);

  return Math.max(lev, dice, tokenSort, 0.5 * tokenSet + 0.5 * lev);
}

/**
 * @param {string} spoken
 * @param {string} expected
 * @param {number} [threshold]
 * @param {{ foldAccents?: boolean, wordThreshold?: number }} [opts]
 */
export function isMatch(spoken, expected, threshold = 0.85, opts = {}) {
  const keywords = keywordsInOrder(spoken, expected, opts);
  if (keywords.ok) {
    return { ok: true, score: 1, via: "keywords", keywords };
  }
  const a = normalize(spoken, opts);
  const b = normalize(expected, opts);
  const score = levenshteinSimilarity(a, b);
  return { ok: score >= threshold, score, via: "similarity", keywords };
}
