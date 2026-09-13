import { appendIgnore, findRuleBlock } from "./helpers.js";

/**
 * Keep legacy Live2D adapters out of every production rule family that
 * operates on source files. The identifier rule receives the same patterns
 * from the return value so its own block stays consistent with the neutral
 * import and type policy blocks.
 */
export function applyLive2dIgnores(
  config,
  { source = "src", packages = "packages" } = {},
) {
  const ignores = [`${source}/io/live2d/**`, `${packages}/adapters/live2d/**`];

  const importBlock = findRuleBlock(config, "import-x/no-unresolved");
  if (!importBlock) {
    throw new Error(
      "RepoAtlas Kukla2D extension requires the portable import config block.",
    );
  }
  appendIgnore(importBlock, ignores);

  const typeBlock = findRuleBlock(config, "local/type-files-only");
  if (!typeBlock) {
    throw new Error(
      "RepoAtlas Kukla2D extension requires the portable TypeScript policy config block.",
    );
  }
  appendIgnore(typeBlock, ignores);

  return ignores;
}
