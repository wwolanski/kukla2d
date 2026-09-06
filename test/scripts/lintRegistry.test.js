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
  it("keeps project-owned message codes unique", () => {
    const codes = entries
      .map(({ definition }) => definition.code)
      .filter(Boolean);

    expect(new Set(codes).size).toBe(codes.length);
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
