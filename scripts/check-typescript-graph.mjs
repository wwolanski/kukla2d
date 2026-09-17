import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { resolveTypeScriptBin } from "repoatlas/providers";

const root = process.cwd();
const sourceRoots = ["src", "packages"];

function collectProductionTypeScript(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectProductionTypeScript(path, files);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(relative(root, path));
    }
  }
  return files;
}

const expected = sourceRoots
  .flatMap((dir) => collectProductionTypeScript(resolve(root, dir)))
  .sort();

const tscPath = resolveTypeScriptBin();
const output = execFileSync(
  process.execPath,
  [tscPath, "--noEmit", "--listFilesOnly"],
  {
    cwd: root,
    encoding: "utf8",
  },
);

const actual = output
  .split(/\r?\n/)
  .filter(Boolean)
  .map((path) => relative(root, path))
  .filter((path) => sourceRoots.some((dir) => path.startsWith(`${dir}/`)))
  .filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".d.ts"))
  .sort();

const actualSet = new Set(actual);
const missing = expected.filter((path) => !actualSet.has(path));

if (missing.length > 0) {
  console.error("Production TypeScript files missing from root typecheck:");
  for (const path of missing) console.error(`  - ${path}`);
  process.exit(1);
}

console.log(
  `TypeScript graph: ${actual.length}/${expected.length} production TS files checked`,
);
