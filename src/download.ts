/**
 * Model acquisition: download (once) from Hugging Face, then use the local
 * cache.
 *
 * Files fetched from the model repository (`ichkil/ichkil` by default):
 *
 * * `model.onnx`   — the ONNX artifact (int64 `input_ids` -> float32 `logits`)
 * * `config.json`  — vocabulary (`sym2id`), `num_tags`, `max_seq_len`
 * * `SHA256SUMS`   — expected checksum of `model.onnx` (verified by default)
 *
 * Everything is cached under `~/.cache/ichkil` (override with the
 * `ICHKIL_CACHE_DIR` environment variable or the `cacheDir` option), so only
 * the first call per revision touches the network.
 */

import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { ChecksumError, ModelLoadError } from "./errors.js";
import type { Config } from "./diacritizer.js";

/** Default Hugging Face model repository. */
export const DEFAULT_REPO_ID = "ichkil/ichkil";

/** Default branch / tag / commit to fetch. */
export const DEFAULT_REVISION = "main";

/** Base URL of the Hugging Face Hub (overridable for tests / mirrors). */
export const HF_BASE_URL = "https://huggingface.co";

/** A resolved, verified local model artifact plus its runtime config. */
export interface ModelBundle {
  onnxPath: string;
  config: Config;
  repoId: string;
  revision: string;
}

/** Options for {@link resolveModel}. */
export interface ResolveOptions {
  /** Hugging Face model repository (default `ichkil/ichkil`). */
  repoId?: string;
  /** Branch, tag or commit to fetch (default `main`). */
  revision?: string;
  /** Cache directory (default: `ICHKIL_CACHE_DIR` or `~/.cache/ichkil`). */
  cacheDir?: string;
  /** Optional Hugging Face token (only needed for gated / private repos). */
  token?: string;
  /** Verify `model.onnx` against `SHA256SUMS` (default `true`). */
  verifyChecksum?: boolean;
  /** Hub base URL (default `https://huggingface.co`). */
  baseUrl?: string;
  /** `fetch` implementation to use (default: the global one). */
  fetchImpl?: typeof fetch;
}

/** Default cache directory (`ICHKIL_CACHE_DIR` or `~/.cache/ichkil`). */
export function defaultCacheDir(): string {
  return process.env.ICHKIL_CACHE_DIR || join(homedir(), ".cache", "ichkil");
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Hex SHA-256 digest of a local file. */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex").toLowerCase();
}

/**
 * Extract the expected SHA-256 for `filename` from a `SHA256SUMS` document,
 * or `undefined` when the file is not listed.
 */
export function parseSha256Sums(text: string, filename: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && (parts[parts.length - 1] ?? "").replace(/^\*/, "") === filename) {
      return (parts[0] ?? "").toLowerCase();
    }
  }
  return undefined;
}

/** Load and minimally validate a `config.json`. */
export function loadConfig(configPath: string): Config {
  let config: Config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8")) as Config;
  } catch (err) {
    throw new ModelLoadError(`failed to read config.json (${configPath}): ${msg(err)}`);
  }
  for (const key of ["sym2id", "num_tags"]) {
    if (!(key in config)) {
      throw new ModelLoadError(
        `config.json is missing required key '${key}' (from ${configPath})`
      );
    }
  }
  return config;
}

async function fetchFile(
  url: string,
  dest: string,
  token: string | undefined,
  fetchImpl: typeof fetch
): Promise<void> {
  const headers: Record<string, string> = { "user-agent": "ichkil-js/1.0" };
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers, redirect: "follow" });
  } catch (err) {
    throw new ModelLoadError(`download failed for ${url}: ${msg(err)}`);
  }
  if (!res.ok) {
    throw new ModelLoadError(
      `download failed for ${url}: HTTP ${res.status} ${res.statusText} ` +
        "(check the repo id, revision and network access)"
    );
  }
  if (!(res.body instanceof ReadableStream)) {
    throw new ModelLoadError(`download failed for ${url}: empty response body`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  try {
    const nodeStream = Readable.fromWeb(
      res.body as unknown as import("node:stream/web").ReadableStream
    );
    await pipeline(nodeStream, createWriteStream(tmp));
    renameSync(tmp, dest);
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function ensureFile(
  path: string,
  url: string,
  token: string | undefined,
  fetchImpl: typeof fetch
): Promise<void> {
  if (existsSync(path)) return;
  await fetchFile(url, path, token, fetchImpl);
}

/**
 * Download (or reuse the cached) model files from Hugging Face.
 *
 * The first call per revision fetches `model.onnx`, `config.json` and
 * `SHA256SUMS`; every later call is served from the local cache.
 */
export async function resolveModel(options: ResolveOptions = {}): Promise<ModelBundle> {
  const repoId = options.repoId ?? DEFAULT_REPO_ID;
  const revision = options.revision ?? DEFAULT_REVISION;
  const verify = options.verifyChecksum ?? true;
  const base = (options.baseUrl ?? HF_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const dir = join(
    options.cacheDir ?? defaultCacheDir(),
    `models--${repoId.replace(/\//g, "--")}`,
    revision
  );

  const onnxPath = join(dir, "model.onnx");
  const configPath = join(dir, "config.json");
  const urlOf = (file: string) => `${base}/${repoId}/resolve/${revision}/${file}`;

  await ensureFile(onnxPath, urlOf("model.onnx"), options.token, fetchImpl);
  await ensureFile(configPath, urlOf("config.json"), options.token, fetchImpl);

  const config = loadConfig(configPath);

  if (verify) {
    let expected: string | undefined;
    try {
      const sumsPath = join(dir, "SHA256SUMS");
      await ensureFile(sumsPath, urlOf("SHA256SUMS"), options.token, fetchImpl);
      expected = parseSha256Sums(readFileSync(sumsPath, "utf8"), "model.onnx");
    } catch (err) {
      if (err instanceof ModelLoadError || err instanceof ChecksumError) throw err;
      expected = undefined; // SHA256SUMS may be absent on some revisions
    }
    expected ??= typeof config.sha256 === "string" ? config.sha256.toLowerCase() : undefined;
    if (!expected) {
      throw new ModelLoadError(
        "cannot verify model checksum: the repository has neither SHA256SUMS " +
          "nor config.sha256 (pass verifyChecksum: false to bypass)"
      );
    }

    const actual = await sha256OfFile(onnxPath);
    if (actual !== expected) {
      // Corrupt or tampered cache file: re-download once and re-verify.
      rmSync(onnxPath, { force: true });
      await ensureFile(onnxPath, urlOf("model.onnx"), options.token, fetchImpl);
      const retry = await sha256OfFile(onnxPath);
      if (retry !== expected) {
        throw new ChecksumError(
          `model checksum mismatch for ${onnxPath}: expected ${expected}, got ${retry}. ` +
            "Delete the local cache file or pass verifyChecksum: false to bypass."
        );
      }
    }
  }

  return { onnxPath, config, repoId, revision };
}
