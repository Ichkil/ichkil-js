/**
 * `ichkil` — Arabic Tashkeel (diacritization) for Node.js.
 *
 * Public API:
 *
 * ```ts
 * import { diacritize, predictLabels, Diacritizer } from "ichkil";
 *
 * await diacritize("محمد قرأ الكتاب");
 * // -> 'مُحَمَّدٌ قَرَأَ الْكِتَابَ'
 * ```
 *
 * The first call downloads the ≈5 MB ONNX model from Hugging Face
 * (`ichkil/ichkil`), verifies its SHA-256 and caches it under
 * `~/.cache/ichkil`; afterwards everything is offline.
 */

// Diacritizer
export { Diacritizer } from "./diacritizer.js";
export type { Config, DiacritizerOptions } from "./diacritizer.js";

// Pure text pipeline (model-free)
export {
  AR_LETTER_RE,
  AR_DIACRITIC_RE,
  TATWEEL,
  LABEL_NON_LETTER,
  LABEL_NONE,
  NUM_LABELS,
  LABEL_TO_COMBO,
  COMBO_TO_LABEL,
  isArabicLetter,
  labelToCombo,
  comboToLabel,
  stripDiacritics,
  encode,
  argmax,
  decode,
  attach,
} from "./pipeline.js";

// Model acquisition
export {
  DEFAULT_REPO_ID,
  DEFAULT_REVISION,
  HF_BASE_URL,
  defaultCacheDir,
  sha256OfFile,
  parseSha256Sums,
  loadConfig,
  resolveModel,
} from "./download.js";
export type { ModelBundle, ResolveOptions } from "./download.js";

// Errors
export {
  IchkilError,
  ChecksumError,
  ModelLoadError,
  InferenceError,
} from "./errors.js";

// Version
export { version } from "./version.js";

import { Diacritizer } from "./diacritizer.js";
import { version as versionValue } from "./version.js";

/** The lazily-created default diacritizer (shared by the module-level API). */
let defaultPromise: Promise<Diacritizer> | undefined;

function getDefault(): Promise<Diacritizer> {
  if (!defaultPromise) {
    defaultPromise = Diacritizer.create();
  }
  return defaultPromise;
}

/**
 * Vocalize bare (or already vocalized) Arabic text.
 *
 * The first call downloads the model from Hugging Face (≈5 MB), verifies its
 * SHA-256 and caches it under `~/.cache/ichkil`; every later call is offline.
 * Concurrent calls share the same model creation.
 *
 * For advanced options (pinned revisions, custom repos, threads) construct
 * a {@link Diacritizer} explicitly.
 */
export async function diacritize(text: string): Promise<string> {
  const diacritizer = await getDefault();
  return diacritizer.diacritize(text);
}

/**
 * Predicted label id (0..12) for every character of `text`, aligned with the
 * diacritic-stripped input. See {@link Diacritizer.predictLabels}.
 */
export async function predictLabels(text: string): Promise<number[]> {
  const diacritizer = await getDefault();
  return diacritizer.predictLabels(text);
}

/** Drop the lazily-created default instance (useful in tests / long-running apps). */
export async function resetDefault(): Promise<void> {
  const pending = defaultPromise;
  defaultPromise = undefined;
  if (pending) {
    try {
      const diacritizer = await pending;
      await diacritizer.release();
    } catch {
      // A failed first creation left nothing to release.
    }
  }
}

export const __version = versionValue;
