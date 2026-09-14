import path from "node:path";

import { ESLint } from "repoatlas/eslint";
import { createConfig } from "repoatlas/config";
import { describe, expect, it } from "vitest";

import { extendConfig } from "../extension.js";
import extension from "../index.js";
import { repositoryPolicyMessages } from "../registry/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

async function lintRepoCode({ rules = {}, file, code }) {
  const eslint = new ESLint({
    cwd: repositoryRoot,
    overrideConfigFile: true,
    overrideConfig: createConfig({
      config: {
        root: repositoryRoot,
        paths: {
          source: "src",
          features: "src/features",
          packages: "packages",
          tests: "test",
          tsconfig: ".repoatlas/tsconfig.json",
        },
        rules,
        typescript: { manifest: ["src/**/*.ts"], defaultProjectFiles: [] },
      },
      extension,
    }),
  });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(repositoryRoot, file),
  });
  return result.messages;
}

async function lintBrowserGlobal(rules = {}) {
  const messages = await lintRepoCode({
    rules,
    file: "src/features/canvas/domain/__repoatlasControlFixture.js",
    code: "export const browserDocument = document\n",
  });
  return messages.filter((message) => message.message.includes("ARCH-RS-1"));
}

function portableConfig() {
  return [
    {
      files: ["src/**/*.{js,jsx,ts,tsx}", "packages/**/*.{js,jsx,ts,tsx}"],
      rules: {
        "import-x/no-unresolved": "error",
      },
    },
    {
      rules: {
        "import-x/order": ["error", { pathGroups: [] }],
      },
    },
    {
      files: ["src/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
      rules: { "local/type-files-only": "error" },
    },
    {
      settings: { "boundaries/elements": [] },
      rules: {
        "boundaries/dependencies": [
          "error",
          { default: "allow", policies: [] },
        ],
      },
    },
  ];
}

describe("Kukla2D custom RepoAtlas extension", () => {
  it("registers ARCH-RS-1 through ARCH-RS-7", () => {
    const codes = Object.values(repositoryPolicyMessages)
      .map((message) => message.code)
      .sort();

    expect(codes).toEqual([
      "ARCH-RS-1",
      "ARCH-RS-2",
      "ARCH-RS-3",
      "ARCH-RS-4",
      "ARCH-RS-5",
      "ARCH-RS-6",
      "ARCH-RS-7",
    ]);
  });

  it("composes repository policies and dedicated ESLint blocks", () => {
    const config = extendConfig({
      config: portableConfig(),
      context: {
        source: "src",
        features: "src/features",
        packages: "packages",
        alias: "@",
      },
      registry: {},
    });

    const boundaries = config.find(
      (entry) => entry.rules?.["boundaries/dependencies"],
    );
    const policies = boundaries.rules["boundaries/dependencies"][1].policies;
    const elements = boundaries.settings["boundaries/elements"];
    const order = config.find((entry) => entry.rules?.["import-x/order"]);

    expect(policies.map((policy) => policy.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ARCH-RS-2"),
        expect.stringContaining("ARCH-RS-3"),
        expect.stringContaining("ARCH-RS-4"),
        expect.stringContaining("ARCH-RS-5"),
      ]),
    );
    expect(policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: {
            file: {
              path: "src/features/modular-sprite/components/ModularSpriteWizard.tsx",
            },
          },
        }),
        expect.objectContaining({
          from: {
            file: { path: "src/app/layout/components/EditorModals.jsx" },
          },
        }),
      ]),
    );
    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "workspace-package-contract-consumer",
        }),
        expect.objectContaining({ type: "workspace-package-isolated" }),
      ]),
    );
    expect(order.rules["import-x/order"][1].pathGroups).toContainEqual({
      pattern: "@kukla2d/**",
      group: "external",
      position: "after",
    });
    expect(
      config.find((entry) => entry.rules?.["import-x/no-unresolved"]).ignores,
    ).toEqual(["src/io/live2d/**", "packages/adapters/live2d/**"]);
    expect(
      config.find((entry) => entry.rules?.["local/type-files-only"]).ignores,
    ).toEqual(["src/io/live2d/**", "packages/adapters/live2d/**"]);
    expect(config).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rules: { "no-restricted-globals": expect.anything() },
        }),
        expect.objectContaining({ rules: { "max-lines": expect.anything() } }),
        expect.objectContaining({ rules: { "react/prop-types": "off" } }),
        expect.objectContaining({
          rules: { "id-denylist": expect.anything() },
        }),
        expect.objectContaining({
          languageOptions: {
            globals: { __APP_VERSION__: "readonly" },
          },
        }),
      ]),
    );
  });

  it("applies enabled and path exceptions to a repository-owned rule", async () => {
    expect(await lintBrowserGlobal()).toHaveLength(1);
    expect(await lintBrowserGlobal({ "ARCH-RS-1": false })).toEqual([]);
    expect(
      await lintBrowserGlobal({
        "ARCH-RS-1": {
          exceptions: ["src/features/canvas/domain/**"],
        },
      }),
    ).toEqual([]);
    expect(
      await lintBrowserGlobal({
        "ARCH-RS-1": { exceptions: ["src/features/other/domain/**"] },
      }),
    ).toHaveLength(1);
  });

  it("controls a repository-owned boundaries policy independently", async () => {
    const file =
      "src/features/modular-sprite/application/__repoatlasControlFixture.js";
    const lint = async (rules) =>
      (
        await lintRepoCode({
          rules,
          file,
          code: "import '@/store/projectStore.js'\n",
        })
      ).filter((message) => message.message.includes("ARCH-RS-2"));

    expect(await lint({})).toHaveLength(1);
    expect(await lint({ "ARCH-RS-2": false })).toEqual([]);
    expect(await lint({ "ARCH-RS-2": { exceptions: [file] } })).toEqual([]);
    expect(
      await lint({
        "ARCH-RS-2": { exceptions: ["src/features/other/**"] },
      }),
    ).toHaveLength(1);
  });
});
