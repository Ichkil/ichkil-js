#!/usr/bin/env node
/**
 * Quickstart example.
 *
 * Build first (`npm run build`), then run:
 *
 *     node examples/quickstart.mjs                 # default text
 *     node examples/quickstart.mjs "العلم نور"    # your own text
 */

import { diacritize, predictLabels, version } from "../dist/index.js";

const text = process.argv[2] ?? "محمد قرأ الكتاب";

console.log(`ichkil ${version}`);
console.log(`input : ${text}`);

const output = await diacritize(text);
console.log(`output: ${output}`);

const labels = await predictLabels(text);
console.log(`labels: ${labels.join(", ")}`);
