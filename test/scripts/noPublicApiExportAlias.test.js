import path from "node:path";
import { fileURLToPath } from "url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import rule from "../../eslint-rules/no-public-api-export-alias.js";

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
  "alias",
  "components",
  "index.ts",
);

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    parser: tseslint.parser,
    sourceType: "module",
  },
});

ruleTester.run("no-public-api-export-alias", rule, {
  valid: [
    {
      name: "allows an unchanged runtime export name",
      code: "export { createSchemaCatalog } from './application/schemaCatalog.js'\n",
      filename: featureIndex("alias"),
    },
    {
      name: "allows an unchanged type export name",
      code: "export type { SchemaMetadata } from './types/schemaMetadata.js'\n",
      filename: featureIndex("alias"),
    },
    {
      name: "allows aliases inside an internal index barrel",
      code: "export { foo as bar } from './foo.js'\n",
      filename: internalIndex,
    },
  ],
  invalid: [
    {
      name: "rejects a runtime public API export alias",
      code: "export { createSchemaCatalog as createCatalog } from './application/schemaCatalog.js'\n",
      filename: featureIndex("alias"),
      errors: [
        {
          messageId: "exportAlias",
          data: {
            localName: "createSchemaCatalog",
            exportedName: "createCatalog",
          },
        },
      ],
    },
    {
      name: "rejects a type public API export alias",
      code: "export type { SchemaMetadata as Metadata } from './types/schemaMetadata.js'\n",
      filename: featureIndex("alias"),
      errors: [
        {
          messageId: "exportAlias",
          data: { localName: "SchemaMetadata", exportedName: "Metadata" },
        },
      ],
    },
  ],
});

describe("ARCH-018 scope", () => {
  it("keeps aliases outside the module root public API unreported", () => {
    expect(path.basename(internalIndex)).toBe("index.ts");
  });
});
