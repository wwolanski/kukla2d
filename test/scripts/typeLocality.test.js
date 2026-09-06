import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  analyzeTypeLocality,
  discoverPublicApiFiles,
  formatTypeLocalityDiagnostic,
  formatTypeLocalityReport,
  shouldUseColor,
} from "../../scripts/type-locality.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function project(files, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kukla2d-type-locality-"));
  temporaryRoots.push(root);
  const sources = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        target: "ES2022",
      },
      include: ["src/**/*.ts", "packages/**/*.ts"],
    }),
    ...files,
  };
  for (const [relativeFile, content] of Object.entries(sources)) {
    const fileName = path.join(root, relativeFile);
    fs.mkdirSync(path.dirname(fileName), { recursive: true });
    fs.writeFileSync(fileName, content);
  }
  return analyzeTypeLocality({ root, publicApiFiles: [], ...options });
}

describe("type locality project checker", () => {
  it("requires a dedicated type file for a type consumed by two implementation files", () => {
    const diagnostics = project({
      "src/shared.ts": "export interface Shared { value: string }",
      "src/first.ts":
        "import type { Shared } from './shared.js'; export const first = (value: Shared) => value.value",
      "src/second.ts":
        "import type { Shared } from './shared.js'; export const second = (value: Shared) => value.value",
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "TYPE-001",
        name: "Shared",
        consumers: ["src/first.ts", "src/second.ts"],
      }),
    ]);
  });

  it.each([
    ["suffix file", "src/shared.types.ts"],
    ["types directory", "src/types/shared.ts"],
  ])("accepts a shared type in a %s", (_name, declarationFile) => {
    const diagnostics = project({
      [declarationFile]: "export interface Shared { value: string }",
      "src/first.ts": `import type { Shared } from './${declarationFile === "src/shared.types.ts" ? "shared.types" : "types/shared"}.js'; export const first = (value: Shared) => value.value`,
      "src/second.ts": `import type { Shared } from './${declarationFile === "src/shared.types.ts" ? "shared.types" : "types/shared"}.js'; export const second = (value: Shared) => value.value`,
    });

    expect(diagnostics).toEqual([]);
  });

  it("reports a dedicated type that has exactly one concrete consumer", () => {
    const diagnostics = project({
      "src/feedback.types.ts":
        "export interface FeedbackEntry { message: string }",
      "src/feedback.ts":
        "import type { FeedbackEntry } from './feedback.types.js'; export function getFeedback(): FeedbackEntry { return { message: 'ok' } }",
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "TYPE-004",
        name: "FeedbackEntry",
        consumers: ["src/feedback.ts"],
      }),
    ]);
  });

  it("does not count imports and re-exports as concrete consumers", () => {
    const diagnostics = project({
      "src/value.types.ts": "export type Value = { id: string }",
      "src/barrel.ts": "export type { Value } from './value.types.js'",
      "src/unused.ts":
        "import type { Value } from './value.types.js'; export const present = true",
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "TYPE-003",
        name: "Value",
        consumers: [],
      }),
    ]);
  });

  it("counts aliased imports once per consumer file", () => {
    const diagnostics = project({
      "src/value.types.ts": "export type Value = { id: string }",
      "src/first.ts":
        "import type { Value as Model } from './value.types.js'; export const first = (a: Model, b: Model[]) => [a, b]",
      "src/second.ts":
        "import type { Value } from './value.types.js'; export const second = (value: Value) => value.id",
    });

    expect(diagnostics).toEqual([]);
  });

  it("requires an unnecessary local export to be removed", () => {
    const diagnostics = project({
      "src/value.ts":
        "export interface LocalValue { id: string }\nexport const id = (value: LocalValue) => value.id",
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "TYPE-003",
        name: "LocalValue",
        consumers: ["src/value.ts"],
      }),
    ]);
  });

  it("requires a type owned by its sole external consumer to move to that file", () => {
    const diagnostics = project({
      "src/orphan.ts": "export interface ConsumerOwned { id: string }",
      "src/consumer.ts":
        "import type { ConsumerOwned } from './orphan.js'; export const id = (value: ConsumerOwned) => value.id",
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "TYPE-004",
        name: "ConsumerOwned",
        consumers: ["src/consumer.ts"],
      }),
    ]);
  });

  it("allows a public contract with no current concrete consumer when it is dedicated", () => {
    const diagnostics = project(
      {
        "src/public.types.ts": "export interface PublicContract { id: string }",
        "src/index.ts":
          "export type { PublicContract } from './public.types.js'",
      },
      { publicApiFiles: ["src/index.ts"] },
    );

    expect(diagnostics).toEqual([]);
  });

  it("requires a public contract to use a dedicated type location", () => {
    const diagnostics = project(
      {
        "src/public.ts": "export interface PublicContract { id: string }",
        "src/index.ts": "export type { PublicContract } from './public.js'",
      },
      { publicApiFiles: ["src/index.ts"] },
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "TYPE-001",
        name: "PublicContract",
        publicContract: true,
      }),
    ]);
  });

  it("discovers package type entrypoints and feature module entrypoints", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "kukla2d-type-entrypoints-"),
    );
    temporaryRoots.push(root);
    fs.mkdirSync(path.join(root, "packages", "demo", "src"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "src", "features", "demo"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, "packages", "demo", "package.json"),
      JSON.stringify({
        exports: { ".": { types: "./src/index.ts", import: "./src/index.ts" } },
      }),
    );
    fs.writeFileSync(
      path.join(root, "packages", "demo", "src", "index.ts"),
      "export type Demo = string",
    );
    fs.writeFileSync(
      path.join(root, "src", "features", "demo", "index.ts"),
      "export type Feature = string",
    );

    expect(
      discoverPublicApiFiles(root)
        .map((file) => path.relative(root, file))
        .sort(),
    ).toEqual(["packages/demo/src/index.ts", "src/features/demo/index.ts"]);
  });

  it("automatically protects contracts exposed by package type entrypoints", () => {
    const diagnostics = project(
      {
        "packages/demo/package.json": JSON.stringify({
          exports: {
            ".": { types: "./src/index.ts", import: "./src/index.ts" },
          },
        }),
        "packages/demo/src/public.types.ts":
          "export interface PublicContract { id: string }",
        "packages/demo/src/index.ts":
          "export type { PublicContract } from './public.types.js'",
      },
      { publicApiFiles: undefined },
    );

    expect(diagnostics).toEqual([]);
  });

  it("formats diagnostics from the central lint message registry", () => {
    const message = formatTypeLocalityDiagnostic({
      code: "TYPE-004",
      name: "FeedbackEntry",
      file: "src/domain/editorModeFeedback.types.ts",
      line: 1,
      column: 18,
      consumers: ["src/domain/editorModeFeedback.ts"],
      publicContract: false,
    });

    expect(message).toContain(
      'TYPE-004: Type declaration "FeedbackEntry" has only one concrete consumer file.',
    );
    expect(message).toContain("Consumer: src/domain/editorModeFeedback.ts");
  });

  it("formats a plain stylish report grouped by absolute file path", () => {
    const report = formatTypeLocalityReport(
      [
        {
          code: "TYPE-004",
          name: "FeedbackEntry",
          file: "src/domain/editorModeFeedback.types.ts",
          line: 1,
          column: 18,
          consumers: ["src/domain/editorModeFeedback.ts"],
          publicContract: false,
        },
      ],
      { root: "/repo", color: false },
    );

    expect(report).toContain(
      path.resolve("/repo/src/domain/editorModeFeedback.types.ts"),
    );
    expect(report).toContain(
      '1:18  error  TYPE-004: Type declaration "FeedbackEntry"',
    );
    expect(report).toContain("type-locality");
    expect(report).toContain("✖ 1 problem (1 error, 0 warnings)");
    expect(report).not.toContain("\u001B[");
  });

  it("adds ANSI styling only when color output is enabled", () => {
    const diagnostic = {
      code: "TYPE-003",
      name: "Unused",
      file: "src/unused.types.ts",
      line: 2,
      column: 13,
      consumers: [],
      publicContract: false,
    };

    expect(
      formatTypeLocalityReport([diagnostic], { root: "/repo", color: true }),
    ).toContain("\u001B[31merror\u001B[39m");
    expect(
      shouldUseColor({ stream: { isTTY: false }, env: { FORCE_COLOR: "1" } }),
    ).toBe(true);
    expect(
      shouldUseColor({ stream: { isTTY: true }, env: { NO_COLOR: "" } }),
    ).toBe(false);
    expect(
      shouldUseColor({ stream: { isTTY: true }, env: { FORCE_COLOR: "0" } }),
    ).toBe(false);
  });
});
