# Changelog

All notable changes to the `ichkil` npm package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-07

### Changed

- Targets model **v0.3.0**: `DEFAULT_REVISION` is now pinned to the `v0.3.0` tag of
  `ichkil/ichkil` (was `main`), so a future model release can never change the
  behavior of an installed version. `revision: "v0.1.0"` still loads the old model.
- **16 labels**: adds 13/14/15 = shadda + tanwin fatha / damma / kasra
  (e.g. عَدُوٌّ, قَوِيًّا). Ids 0–12 are unchanged.
- `stripDiacritics` now normalizes first (new `normalizeText`: NFC, ٱ→ا, ی→ي, ک→ك,
  ہ→ه, zero-width characters removed, whitespace collapsed), matching the model's
  training data.
- Arabic letter range is now U+0621–U+063A, U+0641–U+064A (tatweel is not a letter).
- Model quality: DER 2.32 % on Fadel (was 2.80 %), 2.14 % on modern news (was ~11 %);
  much better phrase endings, proper nouns and loanwords. Model size ≈22 MB.
- Golden vectors updated to the v0.3.0 contract (37 vectors).

### Fixed

- The integration tests now reuse the Hugging Face cache only for the pinned
  revision instead of the first cached snapshot found.

## [1.0.0] - 2026-01-01

### Added

- Initial public release.
- `Diacritizer` — one-call Arabic Tashkeel backed by a ≈5 MB ONNX model
  (`input_ids` int64 `[batch, seq]` → `logits` float32 `[batch, seq, 13]`),
  downloaded from Hugging Face (`ichkil/ichkil`), SHA-256-verified, cached
  under `~/.cache/ichkil`; `Diacritizer.fromFile()` for fully offline use.
- Module-level convenience API: `diacritize(text)`, `predictLabels(text)`,
  `resetDefault()` — all async, sharing one lazily-created default instance.
- Dual ESM + CommonJS builds with TypeScript definitions (`dist/`), Node ≥ 18.
- Pure text pipeline (model-free): `stripDiacritics`, `encode`, `decode`,
  `attach`, label tables (13 labels), tatweel normalization — shared with and
  kept in sync with the Python and Go runtimes.
- Typed error hierarchy: `IchkilError` ← `ChecksumError`, `ModelLoadError`,
  `InferenceError`.
- CLI: `ichkil` (positional text or stdin, `--model` offline mode, `--json`,
  `--repo`, `--revision`, `--version`).
- Cross-runtime golden vector suite (`test/golden.json`, copied from the core
  repository) plus pure-pipeline and integration tests.
- CI: lint (eslint), typecheck (tsc), build (tsup), test matrix Node 18/20/22,
  tarball content verification.
- npm publishing with provenance (OIDC trusted publishing) on `v*` tags.
