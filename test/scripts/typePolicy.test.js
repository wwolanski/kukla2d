import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint, RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import noTypesTypesFile from "../../eslint-rules/no-types-types-file.js";
import typeDeclarationLocation from "../../eslint-rules/type-declaration-location.js";
import typeFileRequiresExport from "../../eslint-rules/type-file-requires-export.js";
import typeFilesOnly from "../../eslint-rules/type-files-only.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixture = (...parts) =>
  path.join(projectRoot, "test", "fixtures", "type-policy", ...parts);

const ruleTesterOptions = {
  languageOptions: {
    ecmaVersion: "latest",
    parser: tseslint.parser,
    sourceType: "module",
  },
};

new RuleTester(ruleTesterOptions).run(
  "type-declaration-location",
  typeDeclarationLocation,
  {
    valid: [
      {
        name: "allows a local type beside implementation code",
        code: "type Local = { value: string }",
        filename: fixture("component.ts"),
      },
      {
        name: "allows a local interface beside implementation code",
        code: "interface LocalState { open: boolean }",
        filename: fixture("component.tsx"),
      },
      {
        name: "allows exported declarations in a suffix type file",
        code: "export interface Public {}",
        filename: fixture("contracts.types.ts"),
      },
      {
        name: "allows exported declarations in a types tree",
        code: "export type Public = {}",
        filename: fixture("types", "contracts.ts"),
      },
      {
        name: "does not treat a re-export as an original declaration",
        code: "export type { Public } from './types/contracts.js'",
        filename: fixture("index.ts"),
      },
      {
        name: "leaves declaration files to TypeScript declaration-file semantics",
        code: "export interface Public {}",
        filename: fixture("public.d.ts"),
      },
    ],
    invalid: [
      {
        name: "rejects an exported type in an implementation file",
        code: "export type Public = {}",
        filename: fixture("component.ts"),
        errors: [
          {
            messageId: "exportedTypeOutsideTypeFile",
            data: { name: "Public" },
          },
        ],
      },
      {
        name: "rejects an exported interface in an implementation file",
        code: "export interface Props {}",
        filename: fixture("Component.tsx"),
        errors: [
          { messageId: "exportedTypeOutsideTypeFile", data: { name: "Props" } },
        ],
      },
      {
        name: "tracks a separately declared type-only export",
        code: "type Public = {}\nexport type { Public }",
        filename: fixture("component.ts"),
        errors: [
          {
            messageId: "exportedTypeOutsideTypeFile",
            data: { name: "Public" },
          },
        ],
      },
      {
        name: "tracks an unmarked separately declared export",
        code: "interface Public {}\nexport { Public }",
        filename: fixture("component.ts"),
        errors: [
          {
            messageId: "exportedTypeOutsideTypeFile",
            data: { name: "Public" },
          },
        ],
      },
      {
        name: "rejects a default-exported interface in an implementation file",
        code: "export default interface Public {}",
        filename: fixture("component.ts"),
        errors: [
          {
            messageId: "exportedTypeOutsideTypeFile",
            data: { name: "Public" },
          },
        ],
      },
    ],
  },
);

new RuleTester(ruleTesterOptions).run("type-files-only", typeFilesOnly, {
  valid: [
    {
      name: "allows type declarations and type-only imports/exports",
      code: [
        "import type { Source } from './source.js'",
        "type Internal = { source: Source }",
        "export interface Public { value: Internal }",
        "export type { Other } from './other.js'",
      ].join("\n"),
      filename: fixture("contracts.types.ts"),
    },
    {
      name: "allows a type-only barrel in a types tree",
      code: "export type { Public } from './public.js'",
      filename: fixture("types", "index.ts"),
    },
    {
      name: "allows an explicitly type-only export specifier",
      code: "export { type Public } from './public.js'",
      filename: fixture("types", "index.ts"),
    },
    {
      name: "allows imports whose every binding is explicitly type-only",
      code: [
        "import { type Source, type Metadata } from './source.js'",
        "export interface Public { source: Source; metadata: Metadata }",
      ].join("\n"),
      filename: fixture("contracts.types.ts"),
    },
    {
      name: "allows an empty module export marker",
      code: "export {}",
      filename: fixture("types", "index.ts"),
    },
    {
      name: "does not classify a declaration file as a dedicated implementation type file",
      code: "declare const runtimeValue: string",
      filename: fixture("types", "ambient.d.ts"),
    },
  ],
  invalid: [
    {
      name: "rejects runtime values",
      code: "export const DEFAULT_STATE = {}",
      filename: fixture("contracts.types.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects functions",
      code: "export function createValue() { return {} }",
      filename: fixture("types", "contracts.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects classes",
      code: "export class Value {}",
      filename: fixture("types", "contracts.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects enums",
      code: "export enum Status { Ready }",
      filename: fixture("types", "contracts.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects runtime imports",
      code: "import { createValue } from './value.js'",
      filename: fixture("types", "contracts.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects a mixed import containing a runtime binding",
      code: "import { type Value, createValue } from './value.js'",
      filename: fixture("types", "contracts.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects runtime re-exports",
      code: "export { createValue } from './value.js'",
      filename: fixture("types", "contracts.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects side effects",
      code: "console.log('value')",
      filename: fixture("types", "contracts.ts"),
      errors: [{ messageId: "runtimeConstruct" }],
    },
    {
      name: "rejects ambient runtime values",
      code: "declare const value: string\ndeclare function createValue(): void\ndeclare class RuntimeValue {}",
      filename: fixture("types", "contracts.ts"),
      errors: 3,
    },
  ],
});

new RuleTester(ruleTesterOptions).run("no-types-types-file", noTypesTypesFile, {
  valid: [
    {
      name: "allows semantic names inside types",
      code: "export type Contract = {}",
      filename: fixture("types", "contracts.ts"),
    },
    {
      name: "allows types.ts outside a types tree",
      code: "export type Contract = {}",
      filename: fixture("domain", "types.ts"),
    },
    {
      name: "allows the *.types.ts suffix",
      code: "export type Contract = {}",
      filename: fixture("contracts.types.ts"),
    },
  ],
  invalid: [
    {
      name: "rejects types.ts directly under types",
      code: "export type Contract = {}",
      filename: fixture("types", "types.ts"),
      errors: [{ messageId: "genericTypesFileName" }],
    },
    {
      name: "rejects types.ts at any depth below types",
      code: "export type Contract = {}",
      filename: fixture("types", "api", "types.ts"),
      errors: [{ messageId: "genericTypesFileName" }],
    },
  ],
});

new RuleTester(ruleTesterOptions).run(
  "type-file-requires-export",
  typeFileRequiresExport,
  {
    valid: [
      {
        name: "accepts an exported type alias",
        code: "export type Public = {}",
        filename: fixture("contracts.types.ts"),
      },
      {
        name: "accepts an exported interface with a private helper",
        code: "type Internal = {}\nexport interface Public { value: Internal }",
        filename: fixture("contracts.types.ts"),
      },
      {
        name: "accepts a type-only barrel",
        code: "export type { Public } from './public.js'",
        filename: fixture("types", "index.ts"),
      },
      {
        name: "accepts a type-only export specifier barrel",
        code: "export { type Public } from './public.js'",
        filename: fixture("types", "index.ts"),
      },
      {
        name: "accepts a type-only export star",
        code: "export type * from './public.js'",
        filename: fixture("types", "index.ts"),
      },
      {
        name: "accepts a locally declared type exported without a type marker",
        code: "type Public = {}\nexport { Public }",
        filename: fixture("contracts.types.ts"),
      },
      {
        name: "accepts a locally declared interface exported without a type marker",
        code: "interface Public {}\nexport { Public }",
        filename: fixture("contracts.types.ts"),
      },
    ],
    invalid: [
      {
        name: "rejects only local declarations",
        code: "type Internal = {}\ninterface AnotherInternal {}",
        filename: fixture("contracts.types.ts"),
        errors: [{ messageId: "missingTypeExport" }],
      },
      {
        name: "rejects an empty barrel",
        code: "export {}",
        filename: fixture("types", "index.ts"),
        errors: [{ messageId: "missingTypeExport" }],
      },
    ],
  },
);

describe("TYPE-001–007 flat config integration", () => {
  it("enables the policy rules for production TypeScript and type-only exports", async () => {
    const eslint = new ESLint({ cwd: projectRoot });
    const config = await eslint.calculateConfigForFile(
      path.join(projectRoot, "src/features/canvas/domain/framePose.ts"),
    );

    expect(config.rules["local/type-declaration-location"]).toEqual([2]);
    expect(config.rules["local/type-files-only"]).toEqual([2]);
    expect(config.rules["local/no-types-types-file"]).toEqual([2]);
    expect(config.rules["local/type-file-requires-export"]).toEqual([2]);
    expect(config.rules["@typescript-eslint/consistent-type-exports"]).toEqual([
      2,
    ]);
  });
});
