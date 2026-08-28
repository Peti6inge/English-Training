/**
 * Standalone string normalization + fuzzy comparison.
 * Default tolerance is 0.85 (85% similarity).
 */

const PUNCT_RE = /[^\p{L}\p{N}\s']/gu;
const MULTI_SPACE_RE = /\s+/g;

/**
 * Lowercase, strip punctuation, collapse whitespace, optional accent fold.
 * @param {string} input
 * @param {{ foldAccents?: boolean }} [opts]
 */
export function normalize(input, opts = {}) {
  if (!input) return "";
  let text = String(input).normalize("NFKC").toLowerCase();
  if (opts.foldAccents !== false) {
    text = text.normalize("NFD").replace(/\p{M}/gu, "");
  }
  text = text.replace(PUNCT_RE, " ").replace(MULTI_SPACE_RE, " ").trim();
  return text;
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
 */
export function isMatch(spoken, expected, threshold = 0.85) {
  const score = similarity(spoken, expected);
  return { ok: score >= threshold, score };
}
