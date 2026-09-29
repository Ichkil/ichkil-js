/**
 * The {@link Diacritizer} — a ready-to-use Arabic diacritizer backed by ONNX.
 *
 * The model (`model.onnx` + `config.json`) is downloaded from Hugging Face
 * on first use and cached under `~/.cache/ichkil`; afterwards construction
 * is offline.
 *
 * ```ts
 * import { diacritize } from "ichkil";
 *
 * console.log(await diacritize("محمد قرأ الكتاب"));
 * // -> 'مُحَمَّدٌ قَرَأَ الْكِتَابَ'
 * ```
 *
 * All inference entry points are asynchronous: the ONNX Runtime Node backend
 * executes `session.run` on a worker, and the first call may download the
 * model from Hugging Face.
 */

import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as ort from "onnxruntime-node";

import {
  attach,
  encode,
  argmax,
  stripDiacritics,
} from "./pipeline.js";
import { loadConfig, resolveModel } from "./download.js";
import type { ModelBundle, ResolveOptions } from "./download.js";
import { InferenceError, ModelLoadError } from "./errors.js";

/** Runtime configuration loaded from the model repository `config.json`. */
export interface Config {
  /** Character -> vocabulary id mapping (includes `<pad>`/`<unk>`). */
  sym2id: Record<string, number>;
  /** Number of labels (13). */
  num_tags: number;
  /** Maximum supported sequence length (1024). */
  max_seq_len?: number;
  /** Optional SHA-256 of `model.onnx` (fallback when `SHA256SUMS` is absent). */
  sha256?: string;
  [key: string]: unknown;
}

/** Options for {@link Diacritizer.create}. */
export type DiacritizerOptions = ResolveOptions & {
  /** ONNX Runtime intra-op thread count (default: ORT heuristic). */
  numThreads?: number;
};

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class Diacritizer {
  /** Hugging Face repo id of the loaded model (`<local>` for `fromFile`). */
  readonly repoId: string;
  /** Revision (branch / tag / commit) of the loaded model. */
  readonly revision: string;
  /** Number of labels (13). */
  readonly numLabels: number;
  /** Maximum supported sequence length (0 = unknown). */
  readonly maxSeqLen: number;

  private readonly sym2id: Record<string, number>;
  private readonly unkId: number;
  private readonly session: ort.InferenceSession;

  private constructor(
    session: ort.InferenceSession,
    config: Config,
    repoId: string,
    revision: string
  ) {
    this.session = session;
    this.sym2id = { ...config.sym2id };
    this.numLabels = config.num_tags;
    this.maxSeqLen = config.max_seq_len ?? 0;
    this.unkId = this.sym2id["<unk>"] ?? 1;
    this.repoId = repoId;
    this.revision = revision;
  }

  /**
   * Create a diacritizer, downloading the model from Hugging Face on first
   * use (cached afterwards).
   */
  static async create(options: DiacritizerOptions = {}): Promise<Diacritizer> {
    const bundle = await resolveModel(options);
    return Diacritizer.fromBundle(bundle, options);
  }

  /**
   * Build a diacritizer from local `model.onnx` + `config.json` files.
   *
   * `configPath` defaults to `config.json` next to the model.
   */
  static async fromFile(
    modelPath: string,
    configPath?: string,
    options: Pick<DiacritizerOptions, "numThreads"> = {}
  ): Promise<Diacritizer> {
    if (!existsSync(modelPath)) {
      throw new ModelLoadError(`model file not found: ${modelPath}`);
    }
    const cfgPath = configPath ?? join(dirname(modelPath), "config.json");
    if (!existsSync(cfgPath)) {
      throw new ModelLoadError(`config file not found: ${cfgPath}`);
    }
    const config = loadConfig(cfgPath);
    return Diacritizer.fromBundle(
      { onnxPath: modelPath, config, repoId: "<local>", revision: basename(modelPath) },
      options
    );
  }

  private static async fromBundle(
    bundle: ModelBundle,
    options: DiacritizerOptions
  ): Promise<Diacritizer> {
    const sessionOptions: ort.InferenceSession.SessionOptions = {
      graphOptimizationLevel: "all",
    };
    if (options.numThreads) {
      sessionOptions.intraOpNumThreads = options.numThreads;
    }
    let session: ort.InferenceSession;
    try {
      session = await ort.InferenceSession.create(bundle.onnxPath, sessionOptions);
    } catch (err) {
      throw new ModelLoadError(
        `failed to load ONNX model ${bundle.onnxPath}: ${msg(err)}`
      );
    }
    return new Diacritizer(session, bundle.config, bundle.repoId, bundle.revision);
  }

  /**
   * Predicted label id (0..12) for every character of `text`.
   *
   * The input is stripped of diacritics and tatweel first, so the returned
   * array is aligned with the stripped characters.
   */
  async predictLabels(text: string): Promise<number[]> {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    const base = stripDiacritics(text);
    if (base.length === 0) return [];
    const ids = encode(base, this.sym2id, this.unkId);
    const tensor = new ort.Tensor("int64", ids, [1, ids.length]);
    let results: ort.InferenceSession.ReturnType;
    try {
      results = await this.session.run({ input_ids: tensor });
    } catch (err) {
      throw new InferenceError(`inference failed: ${msg(err)}`);
    }
    const logits = results["logits"];
    if (!logits) {
      throw new InferenceError("model produced no 'logits' output");
    }
    const data = logits.data as Float32Array;
    const n = base.length;
    const labels = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      labels[i] = argmax(data.subarray(i * this.numLabels, (i + 1) * this.numLabels));
    }
    return labels;
  }

  /**
   * Turn bare (or already vocalized) Arabic into fully-vocalized text.
   *
   * ```ts
   * await diacritizer.diacritize("محمد قرأ الكتاب")
   * // -> 'مُحَمَّدٌ قَرَأَ الْكِتَابَ'
   * ```
   */
  async diacritize(text: string): Promise<string> {
    let raw = text == null ? "" : String(text);
    raw = raw.trim();
    if (!raw) return "";
    const base = stripDiacritics(raw);
    if (!base) return raw;
    return attach(base, await this.predictLabels(base));
  }

  /** Release the underlying ONNX Runtime session (idempotent). */
  async release(): Promise<void> {
    await this.session.release();
  }
}
