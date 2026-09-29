#!/usr/bin/env node
/**
 * `ichkil` CLI launcher (see `src/cli.ts`).
 *
 * The build output (`dist/cli.js`) is ESM; this shim exits with the code
 * returned by `main()` (0 success, 1 runtime error, 2 usage error).
 */
import { main } from "../dist/cli.js";

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
