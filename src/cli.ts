/**
 * Command-line interface.
 *
 * Usage:
 *     ichkil "محمد قرأ الكتاب"
 *     ichkil --json "الكتاب على الطاولة"
 *     cat text.txt | ichkil
 *     ichkil --model ./model.onnx "محمد"     # offline
 */

import { Diacritizer } from "./diacritizer.js";
import { DEFAULT_REPO_ID, DEFAULT_REVISION } from "./download.js";
import { version } from "./version.js";

interface ParsedArgs {
  text?: string;
  model?: string;
  repo: string;
  revision: string;
  asJson: boolean;
  help: boolean;
  showVersion: boolean;
  error?: string;
}

const HELP = `ichkil ${version} — Arabic Tashkeel (diacritization)

Usage:
  ichkil [text] [options]

Vocalizes bare Arabic text. Reads STDIN when no text is given.

Options:
  --model <path>     Path to a local model.onnx (offline mode)
  --repo <id>        Hugging Face model repo (default: ${DEFAULT_REPO_ID})
  --revision <ref>   Branch / tag / commit (default: ${DEFAULT_REVISION})
  --json             Emit a JSON object instead of plain text
  --version          Print the version and exit
  -h, --help         Show this help and exit

Exit codes: 0 success, 1 runtime error, 2 usage error.
`;

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    repo: DEFAULT_REPO_ID,
    revision: DEFAULT_REVISION,
    asJson: false,
    help: false,
    showVersion: false,
  };
  let sawPositional = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--model" || arg === "--repo" || arg === "--revision") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      i++;
      if (arg === "--model") args.model = value;
      else if (arg === "--repo") args.repo = value;
      else args.revision = value;
    } else if (arg === "--json") {
      args.asJson = true;
    } else if (arg === "--version") {
      args.showVersion = true;
    } else if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg.length > 1 && arg.startsWith("-")) {
      args.error = `unrecognized option '${arg}'`;
      break;
    } else if (sawPositional) {
      args.error = `unrecognized positional argument '${arg}'`;
      break;
    } else {
      args.text = arg;
      sawPositional = true;
    }
  }
  return args;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

/**
 * CLI entry point.
 *
 * @returns process exit code (0 success, 1 runtime error, 2 usage error).
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n\n`);
    process.stderr.write(HELP);
    return 2;
  }

  if (args.error) {
    process.stderr.write(`error: ${args.error}\n\n`);
    process.stderr.write(HELP);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.showVersion) {
    process.stdout.write(`ichkil ${version}\n`);
    return 0;
  }

  let text = args.text;
  if (text === undefined) {
    if (process.stdin.isTTY) {
      process.stderr.write(HELP);
      return 2;
    }
    text = await readStdin();
  }
  if (!text.trim()) {
    process.stderr.write("error: no input text\n");
    return 2;
  }

  try {
    const diacritizer = args.model
      ? await Diacritizer.fromFile(args.model)
      : await Diacritizer.create({ repoId: args.repo, revision: args.revision });
    const output = await diacritizer.diacritize(text);
    if (args.asJson) {
      process.stdout.write(`${JSON.stringify({ input: text.trim(), output })}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }
    await diacritizer.release();
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    return 1;
  }
}
