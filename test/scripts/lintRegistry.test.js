import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { lintMessageRegistry } from "../../eslint-rules/lint-registry.js";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const entries = Object.entries(lintMessageRegistry).flatMap(
  ([category, messages]) =>
    Object.entries(messages).map(([messageId, definition]) => ({
      category,
      messageId,
      definition,
    })),
);

describe("lint message registry", () => {
  it("registers the module public API architecture diagnostics", () => {
    expect(lintMessageRegistry.architecture.passThrough).toMatchObject({
      code: "ARCH-014",
      message: expect.stringContaining(
        'Public API symbol "{{symbol}}" is exposed through a pass-through forwarding layer.',
      ),
    });
    expect(
      lintMessageRegistry.architecture.publicApiWildcardExport,
    ).toMatchObject({
      code: "ARCH-017",
      message: expect.stringContaining(
        "Module public API must not use wildcard re-exports.",
      ),
    });
    expect(lintMessageRegistry.architecture.publicApiExportAlias).toMatchObject(
      {
        code: "ARCH-018",
        message: expect.stringContaining(
          'Module public API must not rename "{{localName}}" to "{{exportedName}}".',
        ),
      },
    );
  });

  it("keeps project-owned message codes unique", () => {
    const codes = entries
      .map(({ definition }) => definition.code)
      .filter(Boolean);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("keeps general and repository-specific architecture namespaces separate", () => {
    for (const definition of Object.values(lintMessageRegistry.architecture)) {
      if (!definition.code) continue;
      expect(definition.code).toMatch(/^ARCH-\d+$/);
    }

    const repositoryCodes = Object.values(lintMessageRegistry.repository).map(
      ({ code }) => code,
    );

    for (const code of repositoryCodes) {
      expect(code).toMatch(/^ARCH-RS-\d+$/);
    }

    expect(repositoryCodes).toEqual(
      repositoryCodes.map((_, index) => `ARCH-RS-${index + 1}`),
    );
  });

  it("documents at least one executor for every message", () => {
    for (const { category, messageId, definition } of entries) {
      expect(definition.message, `${category}.${messageId}`).toEqual(
        expect.any(String),
      );
      expect(definition.executors, `${category}.${messageId}`).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: expect.any(String),
            rule: expect.any(String),
          }),
        ]),
      );
    }
  });

  it("points custom executors at existing project rule files", () => {
    for (const { category, messageId, definition } of entries) {
      for (const executor of definition.executors) {
        if (executor.kind !== "custom-eslint-rule") continue;

        expect(
          fs.existsSync(path.join(projectRoot, executor.file)),
          `${category}.${messageId} -> ${executor.file}`,
        ).toBe(true);
      }
    }
  });
});
