/**
 * Pure text pipeline for Arabic Tashkeel — no model, no third-party imports.
 *
 * The model emits exactly one label per input character:
 *
 *     0        non-letter token (space / punctuation / digit / Latin) or padding
 *     1        letter carries no diacritic
 *     2 .. 15  the harakat / shadda / tanwin combinations
 *              (13..15 = shadda + tanwin, added in model v0.3)
 *
 * This module is the single source of truth shared by inference and the
 * tests, and it mirrors the reference implementation in the core repository
 * (`ichkil/constants.py`) and the JS pipeline used by the Hugging Face Space.
 * Keep the three in sync.
 */

/** A single Arabic letter (the characters the model may decorate). */
export const AR_LETTER_RE = /[\u0621-\u063A\u0641-\u064A]/;

/** Any Arabic diacritic / harakat code point (stripped from input first). */
export const AR_DIACRITIC_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Tatweel (horizontal line), removed from input before encoding. */
export const TATWEEL = "\u0640";

/** Label id for a non-letter token (space / punctuation) or padding. */
export const LABEL_NON_LETTER = 0;

/** Label id for a letter that carries no diacritic. */
export const LABEL_NONE = 1;

/** Number of labels emitted by the model (16). */
export const NUM_LABELS = 16;

/** Label id -> canonical diacritic combination (16 labels; 0/1 attach nothing). */
export const LABEL_TO_COMBO: readonly string[] = [
  "", // 0  non-letter token
  "", // 1  letter carries no diacritic
  "\u064E", // 2  fatha
  "\u064F", // 3  damma
  "\u0650", // 4  kasra
  "\u0652", // 5  sukun
  "\u0651", // 6  shadda
  "\u0651\u064E", // 7  shadda + fatha
  "\u0651\u064F", // 8  shadda + damma
  "\u0651\u0650", // 9  shadda + kasra
  "\u064B", // 10 tanwin fatha
  "\u064C", // 11 tanwin damma
  "\u064D", // 12 tanwin kasra
  "\u0651\u064B", // 13 shadda + tanwin fatha
  "\u0651\u064C", // 14 shadda + tanwin damma
  "\u0651\u064D", // 15 shadda + tanwin kasra
];

const comboEntries: [string, number][] = [];
for (let i = 0; i < LABEL_TO_COMBO.length; i++) {
  const combo = LABEL_TO_COMBO[i] as string;
  if (combo) comboEntries.push([combo, i]);
}

/** Diacritic combination -> label id (only the non-empty combinations). */
export const COMBO_TO_LABEL: Readonly<Record<string, number>> =
  Object.freeze(Object.fromEntries(comboEntries));

/** Return `true` if `ch` is an Arabic letter (U+0621..U+063A, U+0641..U+064A). */
export function isArabicLetter(ch: string): boolean {
  return ch.length === 1 && AR_LETTER_RE.test(ch);
}

/** Map a label id to its diacritic combination (``""`` for unknown ids). */
export function labelToCombo(label: number): string {
  if (Number.isInteger(label) && label >= 0 && label < NUM_LABELS) {
    return LABEL_TO_COMBO[label] as string;
  }
  return "";
}

/** Map a diacritic combination (or `""`) to its label id (`0` if unknown). */
export function comboToLabel(combo: string): number {
  return COMBO_TO_LABEL[combo] ?? LABEL_NON_LETTER;
}

const CHAR_MAP: Readonly<Record<string, string>> = {
  "\u0671": "\u0627", // alef wasla -> alef
  "\u06CC": "\u064A", // farsi yeh -> yeh
  "\u06A9": "\u0643", // keheh -> kaf
  "\u06C1": "\u0647", // heh goal -> heh
  "\u00A0": " ", // no-break space
};

/**
 * Canonical form used by the model (mirror of the core `normalize_text`):
 * Unicode NFC, presentation variants mapped to base Arabic letters,
 * zero-width characters removed, whitespace runs collapsed, trimmed.
 * Diacritics are kept (see `stripDiacritics`).
 */
export function normalizeText(text: string): string {
  let s = String(text).normalize("NFC");
  s = Array.from(s, (c) => CHAR_MAP[c] ?? c).join("");
  s = s.replace(/[\u200B-\u200F\uFEFF]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Normalize `text`, then remove all diacritics and tatweel.
 *
 * Letters, spaces and punctuation are preserved so the result stays aligned
 * with the characters the model sees.
 */
export function stripDiacritics(text: string): string {
  return normalizeText(text).replace(AR_DIACRITIC_RE, "").split(TATWEEL).join("");
}

/** Map each character to its vocabulary id (out-of-vocabulary -> `unkId`). */
export function encode(
  text: string,
  sym2id: Readonly<Record<string, number>>,
  unkId: number
): number[] {
  const out: number[] = [];
  for (const ch of text) {
    out.push(Object.hasOwn(sym2id, ch) ? (sym2id[ch] as number) : unkId);
  }
  return out;
}

/** Index of the maximum value (first one wins ties), matching ONNX Runtime. */
export function argmax(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  let best = 0;
  let bestV = values[0] as number;
  for (let i = 1; i < values.length; i++) {
    const v = values[i] as number;
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}

/**
 * Attach predicted diacritics onto `base` from flat logits.
 *
 * `logits` is the model output row for `base` in row-major order
 * (`logits.length === base.length * numLabels`). Non-letter characters pass
 * through unchanged.
 */
export function decode(base: string, logits: ArrayLike<number>, numLabels: number): string {
  const chars = Array.from(base);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    if (isArabicLetter(ch)) {
      const off = i * numLabels;
      let best = 0;
      let bestV = -Infinity;
      for (let k = 0; k < numLabels; k++) {
        const v = logits[off + k] as number;
        if (v > bestV) {
          bestV = v;
          best = k;
        }
      }
      out += ch + (LABEL_TO_COMBO[best] ?? "");
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Attach predicted diacritics onto the bare letters of `base`.
 *
 * `labels` is one entry per character of `base`. Non-letter characters pass
 * through unchanged.
 */
export function attach(base: string, labels: ArrayLike<number>): string {
  const chars = Array.from(base);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    const lab = labels[i] as number;
    out += isArabicLetter(ch) ? ch + labelToCombo(lab) : ch;
  }
  return out;
}
