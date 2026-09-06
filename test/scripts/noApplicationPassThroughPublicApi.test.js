import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint, RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import rule from "../../eslint-rules/no-pass-through-public-api.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/eslint-arch014", import.meta.url),
);
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const featureIndex = (feature) =>
  path.join(fixtureRoot, "src", "features", feature, "index.ts");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    parser: tseslint.parser,
    sourceType: "module",
  },
});

ruleTester.run("no-pass-through-public-api", rule, {
  valid: [
    {
      name: "allows a direct Domain public API export",
      code: "export { foo } from './domain/foo.js'\n",
      filename: featureIndex("direct"),
    },
    {
      name: "allows a real Application operation",
      code: "export { importFoo } from './application/importFoo.js'\n",
      filename: featureIndex("real-application"),
    },
    {
      name: "allows a real Composition capability",
      code: "export { service } from './composition/service.js'\n",
      filename: featureIndex("real-composition"),
    },
    {
      name: "does not report a cycle that cannot be traced deterministically",
      code: "export { foo } from './application/a.js'\n",
      filename: featureIndex("cycle"),
    },
    {
      name: "does not lint an internal Application barrel by itself",
      code: "export { createFoo } from './createFoo.js'\n",
      filename: path.join(
        fixtureRoot,
        "src",
        "features",
        "internal-barrel",
        "application",
        "index.ts",
      ),
    },
    {
      name: "does not guess which conflicting export-star provides a symbol",
      code: "export { foo } from './application/index.js'\n",
      filename: featureIndex("ambiguous"),
    },
  ],
  invalid: [
    {
      name: "reports a direct Application-to-Domain pass-through",
      code: "export { foo } from './application/foo.js'\n",
      filename: featureIndex("direct"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "foo",
            passThroughFile: "application/foo.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "tracks renamed exports",
      code: "export { publicFoo } from './application/foo.js'\n",
      filename: featureIndex("alias"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "publicFoo",
            passThroughFile: "application/foo.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "tracks a multi-level Application barrel",
      code: "export { foo } from './application/index.js'\n",
      filename: featureIndex("barrel"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "foo",
            passThroughFile: "application/foo.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "reports a deterministic export-star pass-through",
      code: "export * from './application/foo.js'\n",
      filename: featureIndex("export-all"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "*",
            passThroughFile: "application/foo.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "reports an import-and-export pass-through",
      code: "export { foo } from './application/foo.js'\n",
      filename: featureIndex("import-export"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "foo",
            passThroughFile: "application/foo.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "reports a root import-and-export pass-through",
      code: ["import { foo } from './domain/foo.js'", "export { foo }"].join(
        "\n",
      ),
      filename: featureIndex("direct"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "foo",
            passThroughFile: "index.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "reports a const alias assignment pass-through",
      code: "export { foo } from './application/foo.js'\n",
      filename: featureIndex("alias-assignment"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "foo",
            passThroughFile: "application/foo.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "reports a root const alias assignment pass-through",
      code: [
        "import { foo as sourceFoo } from './domain/foo.js'",
        "export const foo = sourceFoo",
      ].join("\n"),
      filename: featureIndex("direct"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "foo",
            passThroughFile: "index.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
    {
      name: "reports fake Composition forwarding from Infrastructure",
      code: "export { localSchemaApi } from './composition/localSchemaApi.js'\n",
      filename: featureIndex("fake-composition"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "localSchemaApi",
            passThroughFile: "composition/localSchemaApi.ts",
            sourceFile: "infrastructure/browser/localSchemaApi.ts",
          },
        },
      ],
    },
    {
      name: "reports the deepest deterministic multi-hop forwarding layer",
      code: "export { foo } from './application/forwardingA.js'\n",
      filename: featureIndex("multi-hop"),
      errors: [
        {
          messageId: "passThrough",
          data: {
            symbol: "foo",
            passThroughFile: "application/forwardingB.ts",
            sourceFile: "domain/foo.ts",
          },
        },
      ],
    },
  ],
});

describe("ARCH-014 flat config integration", () => {
  it("enables all public API rules only on feature root public APIs", async () => {
    const eslint = new ESLint({ cwd: projectRoot });
    const rootConfig = await eslint.calculateConfigForFile(
      path.join(projectRoot, "src/features/canvas/index.ts"),
    );
    const applicationConfig = await eslint.calculateConfigForFile(
      path.join(
        projectRoot,
        "src/features/canvas/application/useCanvasController.ts",
      ),
    );

    expect(rootConfig.rules["local/no-pass-through-public-api"]).toEqual([2]);
    expect(rootConfig.rules["local/no-public-api-wildcard-export"]).toEqual([
      2,
    ]);
    expect(rootConfig.rules["local/no-public-api-export-alias"]).toEqual([2]);
    expect(
      applicationConfig.rules["local/no-pass-through-public-api"],
    ).toBeUndefined();
    expect(
      applicationConfig.rules["local/no-public-api-wildcard-export"],
    ).toBeUndefined();
    expect(
      applicationConfig.rules["local/no-public-api-export-alias"],
    ).toBeUndefined();
  });
});
