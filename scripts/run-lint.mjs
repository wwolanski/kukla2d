import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { shouldUseColor } from "./type-locality.mjs";

const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;
const SUMMARY_PATTERN =
  /✖\s+(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/g;

export function parseProblemSummary(output) {
  const matches = [
    ...output.replaceAll(ANSI_PATTERN, "").matchAll(SUMMARY_PATTERN),
  ];
  const match = matches.at(-1);
  if (!match) return null;
  return {
    problems: Number(match[1]),
    errors: Number(match[2]),
    warnings: Number(match[3]),
  };
}

export function formatCombinedSummary(
  { problems, errors, warnings },
  color = shouldUseColor(),
) {
  const summary = `✖ ${problems} problem${problems === 1 ? "" : "s"} (${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"})`;
  return color ? `\u001B[1;31m${summary}\u001B[22;39m` : summary;
}

export function runLint({
  root = process.cwd(),
  eslintArgs = process.argv.slice(2),
  execute = spawnSync,
  write = (message) => console.log(message),
  writeOutput = (output) => {
    if (!output) return;
    process.stdout.write(output);
  },
  environment = process.env,
  color = shouldUseColor({ stream: process.stdout, env: environment }),
} = {}) {
  const childEnvironment =
    color && !("FORCE_COLOR" in environment)
      ? { ...environment, FORCE_COLOR: "1" }
      : environment;
  const commands = [
    {
      name: "eslint",
      args: [
        path.resolve(root, "node_modules/eslint/bin/eslint.js"),
        ".",
        "--cache",
        "--max-warnings",
        "0",
        ...eslintArgs,
      ],
    },
    {
      name: "type-locality",
      args: [path.resolve(root, "scripts/check-type-locality.mjs")],
    },
  ];
  const results = [];
  const summaries = [];

  for (const command of commands) {
    write(`\n=== ${command.name} ===`);
    const result = execute(process.execPath, command.args, {
      cwd: root,
      encoding: "utf8",
      env: childEnvironment,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["inherit", "pipe", "pipe"],
    });
    if (result.error) throw result.error;
    writeOutput(result.stdout ?? "", "stdout");
    writeOutput(result.stderr ?? "", "stderr");
    const status = result.status ?? 1;
    const summary =
      parseProblemSummary(`${result.stdout ?? ""}\n${result.stderr ?? ""}`) ??
      (status === 0 ? { problems: 0, errors: 0, warnings: 0 } : null);
    summaries.push(summary);
    results.push({ name: command.name, status });
  }

  const combinedSummary = summaries.every(Boolean)
    ? summaries.reduce(
        (total, summary) => ({
          problems: total.problems + summary.problems,
          errors: total.errors + summary.errors,
          warnings: total.warnings + summary.warnings,
        }),
        { problems: 0, errors: 0, warnings: 0 },
      )
    : null;
  if (combinedSummary) {
    write("\n=== combined lint summary ===");
    write(formatCombinedSummary(combinedSummary, color));
  }

  return {
    ok: results.every((result) => result.status === 0),
    results,
    combinedSummary,
  };
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    const result = runLint();
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(
      `Lint runner failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
