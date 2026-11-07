# ichkil — Arabic Tashkeel for JavaScript / TypeScript

> Vocalize bare Arabic text with a tiny, self-contained ONNX model (≈22 MB, CPU-only,
> no GPU, no tokenizer, no server). One call, fully offline after the first run.

[![CI](https://github.com/Ichkil/ichkil-js/actions/workflows/ci.yml/badge.svg)](https://github.com/Ichkil/ichkil-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ichkil)](https://www.npmjs.com/package/ichkil)
[![npm - Node.js version](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Hugging Face model](https://img.shields.io/badge/%F0%9F%A4%97_model-ichkil%2Fichkil-yellow)](https://huggingface.co/ichkil/ichkil)
[![Try it in your browser](https://img.shields.io/badge/%F0%9F%A4%97_try%20it-ichkil%2Fichkil%2Ddemo-blue)](https://huggingface.co/spaces/ichkil/ichkil-demo)

`ichkil` downloads its model from [Hugging Face](https://huggingface.co/ichkil/ichkil)
on first use, verifies its SHA-256, and runs inference with
[ONNX Runtime](https://onnxruntime.ai/). After that it is 100 % offline.

```ts
import { diacritize } from "ichkil";

console.log(await diacritize("محمد قرأ الكتاب في المدرسة"));
// -> 'مُحَمَّدٌ قَرَأَ الْكِتَابَ فِي الْمَدْرَسَةِ'
```

## Install

```bash
npm install ichkil
# or
pnpm add ichkil
yarn add ichkil
```

Requires Node.js ≥ 18 (tested on 18, 20 and 22). Dependencies: `onnxruntime-node`
(CPU). Dual ESM + CommonJS builds with TypeScript definitions — no build step
needed on the consumer side.

## Quickstart

```ts
// ESM (TypeScript or .mjs)
import { diacritize, predictLabels, Diacritizer } from "ichkil";

// one-liner (lazy model download on first call, then cached)
await diacritize("العلم نور والجهل ظلمة");
// -> 'الْعِلْمُ نُورٌ وَالْجَهْلُ ظُلْمَةٌ'

```

```ts
import { Diacritizer } from "ichkil";

const d = await Diacritizer.create();               // downloads + verifies + caches the model
await d.diacritize("القهوة جميلة في الصباح");
// -> 'الْقَهْوَةُ جَمِيلَةٌ فِي الصَّبَاحِ'

const labels = await d.predictLabels("كتاب");       // [4, 2, 1, 3]  (one label id per character, 0..15)

await d.release();                                   // when done (optional, idempotent)
```

```js
// CommonJS
const { diacritize } = require("ichkil");

(async () => {
  console.log(await diacritize("محمد قرأ الكتاب"));
})();
```

```ts
// fully offline: point at local files
import { Diacritizer } from "ichkil";

const d = await Diacritizer.fromFile("./model.onnx");
```

### Command line

```bash
npm install -g ichkil
ichkil "محمد قرأ الكتاب"
# مُحَمَّدٌ قَرَأَ الْكِتَابَ

ichkil --json "العلم نور"
# {"input": "العلم نور", "output": "الْعِلْمِ نُورٌ"}

cat text.txt | ichkil                  # read from stdin
ichkil --model ./model.onnx "محمد"    # offline mode
```

## API

| Item | Description |
| --- | --- |
| `diacritize(text: string): Promise<string>` | Vocalize text (module-level convenience, lazy default model). |
| `predictLabels(text: string): Promise<number[]>` | Label id (0–15) per character. |
| `Diacritizer.create(options?): Promise<Diacritizer>` | `repoId`, `revision`, `cacheDir`, `token`, `verifyChecksum`, `numThreads`. |
| `Diacritizer.fromFile(modelPath, configPath?): Promise<Diacritizer>` | Build from local `model.onnx` (+ `config.json` beside it). |
| `d.diacritize(text)` / `d.predictLabels(text)` | Instance methods (same behavior). |
| `d.release()` | Release the ONNX session (idempotent). |
| Pipeline | Pure text helpers: `normalizeText`, `stripDiacritics`, `encode`, `decode`, `attach`, label tables. |
| Errors | `IchkilError` ← `ChecksumError`, `ModelLoadError`, `InferenceError`. |
| `resetDefault()` | Drop the lazily-created default instance (useful in tests). |

### Label contract

The model predicts exactly one label per input character:

| id | meaning | id | meaning |
| --- | --- | --- | --- |
| 0 | non-letter token / padding | 7 | shadda + fatha (ّـَ) |
| 1 | letter, no diacritic | 8 | shadda + damma (ّـُ) |
| 2 | fatha (ـَ) | 9 | shadda + kasra (ّـِ) |
| 3 | damma (ـُ) | 10 | tanwin fatha (ـً) |
| 4 | kasra (ـِ) | 11 | tanwin damma (ـٌ) |
| 5 | sukun (ـْ) | 12 | tanwin kasra (ـٍ) |
| 6 | shadda (ـّ) | 13 | shadda + tanwin fatha (ـًّ) |
| | | 14 | shadda + tanwin damma (ـٌّ) |
| | | 15 | shadda + tanwin kasra (ـٍّ) |

Input is normalized first (Unicode NFC, ٱ→ا, ی→ي, ک→ك, zero-width characters
removed, whitespace collapsed) and existing marks are stripped, so vocalized and
bare input give the same result. Labels predicted on non-letters are
unspecified and never attached.
Non-Arabic characters (Latin letters, digits, punctuation, spaces) pass through
unchanged.

## Model provenance

- Repository: [`ichkil/ichkil`](https://huggingface.co/ichkil/ichkil), pinned to the
  **`v0.3.0`** tag by default (revision `v0.1.0` loads the previous 13-label model).
- SHA-256 of `model.onnx` (v0.3.0): `9779e1aca89cebc77a9b92037b7d700c422cdf6c3774d4883f4652f641f3f705`
- Contract: `input_ids` int64 `[batch, seq]` → `logits` float32 `[batch, seq, 16]`;
  dynamic length, tested up to 1024 characters per call.
- Quality (v0.3.0): DER 2.32 % on Fadel et al. 2019 (classical), 2.14 % on WikiNews
  (modern Arabic); the ONNX artifact scores identically to the PyTorch reference.
- The cross-runtime golden vectors shipped in `test/golden.json` are a verbatim
  copy of the core repository's `golden/vectors.json`

## Model cache

The model is cached under `~/.cache/ichkil` (override with the
`ICHKIL_CACHE_DIR` environment variable or the `cacheDir` option). Only the
first call per revision touches the network; the SHA-256 is verified on every
resolve and a corrupt cache file is re-downloaded once before failing.

## Development

```bash
npm install
npm run lint                 # eslint
npm run typecheck            # tsc --noEmit
npm run build                # tsup → dist/ (ESM + CJS + d.ts)
npm run test:unit            # pure pipeline tests (no network)
npm run test:integration     # + model tests (downloads once, ~22 MB)
npm test                     # everything
```

## Publishing

`v*` tags run the full check suite and are published to npm with **provenance**
(attested by GitHub OIDC). One-time setup:

1. Create the `ichkil` package on npm (first publish, or transfer an existing
   one to the account you will use).
2. Create an [automation token](https://docs.npmjs.com/creating-and-managing-auth-tokens)
   with *Publish* access for that package (a regular token works too).
3. In the GitHub repo: *Settings → Secrets and variables → Actions* → add
   `NPM_TOKEN` with that token.

Then tag and push: `git tag v1.0.1 && git push origin v1.0.1`.

## Sibling libraries

- [ichkil-python](https://github.com/Ichkil/ichkil-python) — PyPI package
- [ichkil-go](https://github.com/Ichkil/ichkil-go) — Go module
- [Core repo](https://github.com/Ichkil/ichkil) — training, evaluation, model spec,
  golden vectors

## License

MIT — [LICENSE](LICENSE) · [github.com/Ichkil/ichkil-js](https://github.com/Ichkil/ichkil-js) · © 2026 Maaouia BenHamed
