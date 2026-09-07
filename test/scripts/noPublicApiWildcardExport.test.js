import path from "node:path";
import { fileURLToPath } from "url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import rule from "../../eslint-rules/no-public-api-wildcard-export.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/eslint-arch014", import.meta.url),
);
const featureIndex = (feature) =>
  path.join(fixtureRoot, "src", "features", feature, "index.ts");
const internalIndex = path.join(
  fixtureRoot,
  "src",
  "features",
  "wildcard",
  "types",
  "index.ts",
);

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    parser: tseslint.parser,
    sourceType: "module",
  },
});

ruleTester.run("no-public-api-wildcard-export", rule, {
  valid: [
    {
      name: "allows explicit named runtime exports at the module root",
      code: "export { foo, bar } from './application/foo.js'\n",
      filename: featureIndex("wildcard"),
    },
    {
      name: "allows explicit named type exports at the module root",
      code: "export type { Foo, Bar } from './types/foo.js'\n",
      filename: featureIndex("wildcard"),
    },
    {
      name: "does not lint an internal index barrel",
      code: "export * from './foo.js'\n",
      filename: internalIndex,
    },
  ],
  invalid: [
    {
      name: "rejects a runtime wildcard export at the module root",
      code: "export * from './application/foo.js'\n",
      filename: featureIndex("wildcard"),
      errors: [{ messageId: "wildcardExport" }],
    },
    {
      name: "rejects a type wildcard export at the module root",
      code: "export type * from './types/foo.js'\n",
      filename: featureIndex("wildcard"),
      errors: [{ messageId: "wildcardExport" }],
    },
  ],
});

describe("ARCH-017 scope", () => {
  it("keeps the internal index boundary outside the public API rule", () => {
    expect(path.basename(internalIndex)).toBe("index.ts");
  });
});
