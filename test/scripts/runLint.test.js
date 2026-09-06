import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  formatCombinedSummary,
  parseProblemSummary,
  runLint,
} from "../../scripts/run-lint.mjs";

describe("lint runner", () => {
  it("runs ESLint and type locality even when ESLint reports violations", () => {
    const execute = vi
      .fn()
      .mockReturnValueOnce({
        status: 1,
        stdout: "✖ 2 problems (2 errors, 0 warnings)",
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "Type locality: no violations",
        stderr: "",
      });

    const result = runLint({
      root: "/repo",
      eslintArgs: ["--fix"],
      execute,
      write: vi.fn(),
      writeOutput: vi.fn(),
      environment: {},
      color: false,
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][1]).toEqual([
      path.resolve("/repo/node_modules/eslint/bin/eslint.js"),
      ".",
      "--cache",
      "--max-warnings",
      "0",
      "--fix",
    ]);
    expect(execute.mock.calls[1][1]).toEqual([
      path.resolve("/repo/scripts/check-type-locality.mjs"),
    ]);
    expect(result).toEqual({
      ok: false,
      results: [
        { name: "eslint", status: 1 },
        { name: "type-locality", status: 0 },
      ],
      combinedSummary: { problems: 2, errors: 2, warnings: 0 },
    });
  });

  it("fails when type locality reports violations", () => {
    const execute = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "✖ 3 problems (3 errors, 0 warnings)",
      });

    expect(
      runLint({
        root: "/repo",
        execute,
        write: vi.fn(),
        writeOutput: vi.fn(),
        environment: {},
        color: false,
      }),
    ).toMatchObject({
      ok: false,
      results: [
        { name: "eslint", status: 0 },
        { name: "type-locality", status: 1 },
      ],
      combinedSummary: { problems: 3, errors: 3, warnings: 0 },
    });
  });

  it("passes only when both lint stages pass", () => {
    const execute = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: "", stderr: "" });

    expect(
      runLint({
        root: "/repo",
        execute,
        write: vi.fn(),
        writeOutput: vi.fn(),
        environment: {},
        color: false,
      }),
    ).toMatchObject({
      ok: true,
      combinedSummary: { problems: 0, errors: 0, warnings: 0 },
    });
  });

  it("parses colored stylish summaries and formats an aggregate result", () => {
    expect(
      parseProblemSummary(
        "\u001B[31m✖ 390 problems (390 errors, 0 warnings)\u001B[39m",
      ),
    ).toEqual({
      problems: 390,
      errors: 390,
      warnings: 0,
    });
    expect(
      formatCombinedSummary({ problems: 1, errors: 1, warnings: 0 }, false),
    ).toBe("✖ 1 problem (1 error, 0 warnings)");
  });

  it("forces colors in captured child output only when the parent supports colors", () => {
    const execute = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: "", stderr: "" });

    runLint({
      root: "/repo",
      execute,
      write: vi.fn(),
      writeOutput: vi.fn(),
      environment: { CI: "false" },
      color: true,
    });

    expect(execute.mock.calls[0][2].env).toEqual({
      CI: "false",
      FORCE_COLOR: "1",
    });
    expect(execute.mock.calls[1][2].env).toEqual({
      CI: "false",
      FORCE_COLOR: "1",
    });
  });

  it("preserves explicit NO_COLOR behavior", () => {
    const execute = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: "", stderr: "" });
    const environment = { NO_COLOR: "" };

    runLint({
      root: "/repo",
      execute,
      write: vi.fn(),
      writeOutput: vi.fn(),
      environment,
      color: false,
    });

    expect(execute.mock.calls[0][2].env).toBe(environment);
  });
});
