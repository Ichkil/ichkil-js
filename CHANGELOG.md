# Changelog

All notable changes to the `ichkil` npm package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
