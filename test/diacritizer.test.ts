/**
 * Integration tests — load the ONNX model and check every golden vector.
 *
 * Model discovery (in order):
 *   1. `$ICHKIL_TEST_MODEL_DIR` — a directory containing `model.onnx` + `config.json`
 *   2. the local Hugging Face hub cache
 *      (`~/.cache/huggingface/hub/models--ichkil--ichkil/snapshots/<sha>/model.onnx`)
 *   3. network download via `Diacritizer.create()` (≈5 MB, cached afterwards)
 *
 * Run with: `npm run test:integration`
 */

import { mkdtempSync, rmSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import golden from "./golden.json";
import { Diacritizer } from "../src/diacritizer.js";
import { resolveModel, sha256OfFile, DEFAULT_REPO_ID } from "../src/download.js";

const VECTORS = golden.vectors as ReadonlyArray<{
  id: string;
  input: string;
  labels: number[];
  expected_text: string;
}>;

function findLocalModel(): string | undefined {
  const envDir = process.env.ICHKIL_TEST_MODEL_DIR;
  if (envDir && existsSync(join(envDir, "model.onnx"))) {
    return join(envDir, "model.onnx");
  }
  const hubRoot = join(
    process.env.HF_HOME ?? join(process.env.HOME ?? tmpdir(), ".cache", "huggingface"),
    "hub",
    "models--ichkil--ichkil",
    "snapshots"
  );
  if (existsSync(hubRoot)) {
    for (const entry of readdirSync(hubRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const model = join(hubRoot, entry.name, "model.onnx");
      if (existsSync(model)) return model;
    }
  }
  return undefined;
}

let diacritizer: Diacritizer | undefined;
let source: string;

async function getDiacritizer(): Promise<Diacritizer> {
  if (!diacritizer) {
    const local = findLocalModel();
    if (local) {
      diacritizer = await Diacritizer.fromFile(local);
      source = `local file: ${local}`;
    } else {
      diacritizer = await Diacritizer.create();
      source = `downloaded from ${DEFAULT_REPO_ID}`;
    }
  }
  return diacritizer;
}

afterAll(async () => {
  await diacritizer?.release();
});

describe("Diacritizer (ONNX model)", () => {
  it("predicts the golden labels for all 29 vectors", async () => {
    const d = await getDiacritizer();
    console.log(`model source: ${source}`);
    for (const v of VECTORS) {
      const labels = await d.predictLabels(v.input);
      expect(labels, `${v.id}: ${v.input}`).toEqual(v.labels);
    }
  });

  it("produces the expected vocalized text for all 29 vectors", async () => {
    const d = await getDiacritizer();
    for (const v of VECTORS) {
      const out = await d.diacritize(v.input);
      expect(out, `${v.id}: ${v.input}`).toBe(v.expected_text);
    }
  });

  it("is idempotent (already-vocalized input gives the same result)", async () => {
    const d = await getDiacritizer();
    expect(await d.diacritize("مُحَمَّدٌ")).toBe(await d.diacritize("محمد"));
    expect(await d.diacritize("كِتَابِ")).toBe(await d.diacritize("كتاب"));
  });

  it("passes non-Arabic characters through unchanged", async () => {
    const d = await getDiacritizer();
    expect(await d.diacritize("a b c 123")).toBe("a b c 123");
    expect(await d.diacritize("محمد 2024")).toMatch(/^مُحَمَّدٌ 2024$/);
  });

  it("handles blank input", async () => {
    const d = await getDiacritizer();
    expect(await d.diacritize("")).toBe("");
    expect(await d.diacritize("   ")).toBe("");
    expect(await d.predictLabels("")).toEqual([]);
  });

  it("exposes model metadata from config.json", async () => {
    const d = await getDiacritizer();
    expect(d.numLabels).toBe(13);
    expect(d.maxSeqLen).toBeGreaterThanOrEqual(1024);
  });
});

describe("resolveModel (fresh cache + checksum verification)", () => {
  it(
    "downloads, verifies SHA-256 and exposes a valid config",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "ichkil-test-"));
      try {
        const bundle = await resolveModel({ cacheDir: dir });
        expect(existsSync(bundle.onnxPath)).toBe(true);
        expect(bundle.config.num_tags).toBe(13);

        const expected =
          typeof bundle.config.sha256 === "string"
            ? bundle.config.sha256.toLowerCase()
            : undefined;
        if (expected) {
          expect(await sha256OfFile(bundle.onnxPath)).toBe(expected);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    240_000
  );
});
