import path from "node:path";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import rule from "../../eslint-rules/no-internal-reexports.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureRoot = fileURLToPath(
  new URL("../fixtures/eslint-arch019", import.meta.url),
);
const internalFile = path.join(
  fixtureRoot,
  "src",
  "features",
  "example",
  "domain",
  "forwarder.ts",
);
const featurePublicApi = path.join(
  fixtureRoot,
  "src",
  "features",
  "example",
  "index.ts",
);
const internalIndex = path.join(
  fixtureRoot,
  "src",
  "features",
  "example",
  "domain",
  "index.ts",
);
const packagePublicApi = path.join(
  fixtureRoot,
  "packages",
  "example",
  "src",
  "public.ts",
);

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    parser: tseslint.parser,
    sourceType: "module",
  },
});

const error = (symbol, source, filename = internalFile) => ({
  messageId: "internalReExport",
  data: {
    forwardingFile: path
      .relative(projectRoot, filename)
      .split(path.sep)
      .join("/"),
    symbol,
    source,
  },
});

ruleTester.run("no-internal-reexports", rule, {
  valid: [
    {
      name: "allows a locally declared runtime export",
      code: "function run() {}\nexport { run }\n",
      filename: internalFile,
    },
    {
      name: "allows a locally declared type export",
      code: "interface Options {}\nexport type { Options }\n",
      filename: internalFile,
    },
    {
      name: "allows an import that is not exported",
      code: "import type { Options } from './options.js'\nexport function useOptions(value: Options) { return value }\n",
      filename: internalFile,
    },
    {
      name: "allows re-exports from a feature public API",
      code: "export type { Options } from './domain/options.js'\n",
      filename: featurePublicApi,
    },
    {
      name: "allows re-exports from a package.json entrypoint",
      code: "export { run } from './run.js'\n",
      filename: packagePublicApi,
    },
  ],
  invalid: [
    {
      name: "rejects a named runtime re-export",
      code: "export { run } from './run.js'\n",
      filename: internalFile,
      errors: [error("run", "./run.js")],
    },
    {
      name: "rejects every symbol in a named re-export",
      code: "export type { Options, Result } from './contracts.js'\n",
      filename: internalFile,
      errors: [
        error("Options", "./contracts.js"),
        error("Result", "./contracts.js"),
      ],
    },
    {
      name: "rejects an inline type re-export",
      code: "export { type Options } from './options.js'\n",
      filename: internalFile,
      errors: [error("Options", "./options.js")],
    },
    {
      name: "rejects a wildcard re-export",
      code: "export * from './run.js'\n",
      filename: internalFile,
      errors: [error("*", "./run.js")],
    },
    {
      name: "rejects a namespace re-export",
      code: "export * as helpers from './helpers.js'\n",
      filename: internalFile,
      errors: [error("helpers", "./helpers.js")],
    },
    {
      name: "rejects an imported binding exported later",
      code: "import { run } from './run.js'\nexport { run }\n",
      filename: internalFile,
      errors: [error("run", "./run.js")],
    },
    {
      name: "rejects an imported binding exported under an alias",
      code: "import type { Options as InternalOptions } from './options.js'\nexport type { InternalOptions as Options }\n",
      filename: internalFile,
      errors: [error("Options", "./options.js")],
    },
    {
      name: "rejects an imported binding exported as default",
      code: "import run from './run.js'\nexport default run\n",
      filename: internalFile,
      errors: [error("default", "./run.js")],
    },
    {
      name: "does not treat an internal index as a public API",
      code: "export { run } from './run.js'\n",
      filename: internalIndex,
      errors: [error("run", "./run.js", internalIndex)],
    },
  ],
});
