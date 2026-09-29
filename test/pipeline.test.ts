/**
 * Pure pipeline tests — no model, no network.
 *
 * Covers the 13-label contract, the text helpers, and the cross-runtime
 * golden vectors (a verbatim copy of the core repository's
 * `golden/vectors.json`): for every vector, `attach(input, labels)` MUST
 * reproduce `expected_text`.
 */

import { describe, expect, it } from "vitest";

import golden from "./golden.json";
import {
  NUM_LABELS,
  LABEL_TO_COMBO,
  COMBO_TO_LABEL,
  attach,
  argmax,
  comboToLabel,
  decode,
  encode,
  isArabicLetter,
  labelToCombo,
  stripDiacritics,
} from "../src/pipeline.js";

const VECTORS = golden.vectors as ReadonlyArray<{
  id: string;
  input: string;
  labels: number[];
  expected_text: string;
}>;

describe("label contract", () => {
  it("has exactly 13 labels", () => {
    expect(NUM_LABELS).toBe(13);
    expect(LABEL_TO_COMBO).toHaveLength(13);
  });

  it("maps label ids to the right diacritic combinations", () => {
    expect(labelToCombo(0)).toBe("");
    expect(labelToCombo(1)).toBe("");
    expect(labelToCombo(2)).toBe("\u064e"); // fatha
    expect(labelToCombo(3)).toBe("\u064f"); // damma
    expect(labelToCombo(4)).toBe("\u0650"); // kasra
    expect(labelToCombo(5)).toBe("\u0652"); // sukun
    expect(labelToCombo(6)).toBe("\u0651"); // shadda
    expect(labelToCombo(7)).toBe("\u0651\u064e"); // shadda + fatha
    expect(labelToCombo(8)).toBe("\u0651\u064f"); // shadda + damma
    expect(labelToCombo(9)).toBe("\u0651\u0650"); // shadda + kasra
    expect(labelToCombo(10)).toBe("\u064b"); // tanwin fatha
    expect(labelToCombo(11)).toBe("\u064c"); // tanwin damma
    expect(labelToCombo(12)).toBe("\u064d"); // tanwin kasra
  });

  it("returns '' for out-of-range or non-integer labels", () => {
    expect(labelToCombo(-1)).toBe("");
    expect(labelToCombo(13)).toBe("");
    expect(labelToCombo(99)).toBe("");
    expect(labelToCombo(2.5)).toBe("");
    expect(labelToCombo(NaN)).toBe("");
  });

  it("round-trips combinations through comboToLabel", () => {
    expect(comboToLabel("\u064e")).toBe(2);
    expect(comboToLabel("\u0651\u0650")).toBe(9);
    expect(comboToLabel("\u064d")).toBe(12);
    expect(comboToLabel("")).toBe(0);
    expect(comboToLabel("zzz")).toBe(0);
    for (const [combo, label] of Object.entries(COMBO_TO_LABEL)) {
      expect(labelToCombo(label)).toBe(combo);
      expect(comboToLabel(combo)).toBe(label);
    }
  });
});

describe("isArabicLetter", () => {
  it("accepts Arabic letters", () => {
    for (const ch of ["ا", "ب", "ت", "م", "ه", "ي"]) {
      expect(isArabicLetter(ch)).toBe(true);
    }
  });

  it("rejects non-letters", () => {
    expect(isArabicLetter(" ")).toBe(false);
    expect(isArabicLetter("a")).toBe(false);
    expect(isArabicLetter("1")).toBe(false);
    expect(isArabicLetter("\u064e")).toBe(false); // fatha is not a letter
    expect(isArabicLetter("")).toBe(false);
    expect(isArabicLetter("ab")).toBe(false);
  });
});

describe("stripDiacritics", () => {
  it("removes diacritics while keeping letters aligned", () => {
    expect(stripDiacritics("مُحَمَّدٌ")).toBe("محمد");
    expect(stripDiacritics("كِتَابِ")).toBe("كتاب");
  });

  it("removes tatweel", () => {
    expect(stripDiacritics("اَلْكِتَاب")).toBe("الكتاب");
  });

  it("keeps spaces and punctuation", () => {
    expect(stripDiacritics("محمد، قرأ!")).toBe("محمد، قرأ!");
  });

  it("is a no-op on plain text", () => {
    expect(stripDiacritics("hello 123")).toBe("hello 123");
  });
});

describe("encode", () => {
  const sym2id = { a: 1, b: 2, " ": 3, "<unk>": 0 };

  it("maps known characters and falls back to unk", () => {
    expect(encode("ab z", sym2id, 0)).toEqual([1, 2, 3, 0]);
  });

  it("encodes every character (no padding, no truncation)", () => {
    expect(encode("ab", sym2id, 0)).toHaveLength(2);
    expect(encode("", sym2id, 0)).toEqual([]);
  });
});

describe("argmax", () => {
  it("picks the maximum", () => {
    expect(argmax([0.1, 0.9, 0.3])).toBe(1);
  });

  it("first index wins ties", () => {
    expect(argmax([0.5, 0.5, 0.1])).toBe(0);
    expect(argmax([1, 1, 1])).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(argmax([])).toBe(0);
  });
});

describe("decode", () => {
  it("attaches diacritics from flat 13-slot logits", () => {
    const n = NUM_LABELS;
    const logits = new Float32Array(n * 3); // "محب" — 3 letters
    logits[0 * n + 2] = 1.0; // م -> fatha
    logits[1 * n + 4] = 1.0; // ح -> kasra
    logits[2 * n + 1] = 1.0; // ب -> no diacritic
    expect(decode("محب", logits, n)).toBe("\u0645\u064e\u062d\u0650\u0628");
  });

  it("passes non-letters through unchanged", () => {
    const n = NUM_LABELS;
    const logits = new Float32Array(n * 2); // "م ب"
    logits[0 * n + 2] = 1.0; // م -> fatha
    expect(decode("م ب", logits, n)).toBe("\u0645\u064e \u0628");
  });
});

describe("attach", () => {
  it("attaches label combinations onto letters", () => {
    // م + damma, ح + fatha, م + shadda + fatha, د + tanwin damma (gv_008)
    expect(attach("محمد", [3, 2, 7, 11])).toBe("مُحَمَّدٌ");
  });

  it("keeps non-letter positions untouched", () => {
    expect(attach("م ح", [2, 0, 4])).toBe("مَ ح\u0650");
  });

  it("ignores out-of-range labels (keeps the bare letter)", () => {
    expect(attach("ب", [99])).toBe("ب");
  });
});

describe("golden vectors (cross-runtime contract)", () => {
  it("ships 29 vectors", () => {
    expect(VECTORS).toHaveLength(29);
  });

  it("attach(input, labels) === expected_text for every vector", () => {
    for (const v of VECTORS) {
      expect(attach(v.input, v.labels), v.id).toBe(v.expected_text);
    }
  });

  it("labels are within the 13-label contract", () => {
    for (const v of VECTORS) {
      expect(v.labels).toHaveLength(v.input.length);
      for (const label of v.labels) {
        expect(label).toBeGreaterThanOrEqual(0);
        expect(label).toBeLessThan(NUM_LABELS);
      }
    }
  });
});
