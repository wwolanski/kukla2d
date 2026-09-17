import { createArchRs1Block } from "./arch-rs-1-domain-browser-globals.js";
import { createArchRs2Policy } from "./arch-rs-2-modular-sprite-store.js";
import { createArchRs3Policies } from "./arch-rs-3-workspace-package-dependency.js";
import { createArchRs4Policy } from "./arch-rs-4-legacy-feature-component.js";
import { createArchRs5Policy } from "./arch-rs-5-canvas-ui-legacy-io.js";
import { createArchRs6Block } from "./arch-rs-6-canvas-max-lines.js";
import { createArchRs7Block } from "./arch-rs-7-identifier-denylist.js";
import { createAppVersionGlobalBlock } from "./app-version-global.js";
import { createCanvasPropTypesBlock } from "./canvas-prop-types.js";
import { createDomainDependencyPolicies } from "./domain-dependency-policies.js";
import { createEditorModalException } from "./editor-modal-exception.js";
import {
  appendConfigBlock,
  appendPolicies,
  appendUnique,
  findBoundariesBlock,
  findRuleBlock,
  repositoryAlias,
  repositoryPaths,
} from "./helpers.js";
import { createImportOrderPathGroup } from "./import-order.js";
import { applyLive2dIgnores } from "./live2d-ignores.js";
import { createModularSpriteCompositionException } from "./modular-sprite-composition-exception.js";
import { createWorkspaceElements } from "./workspace-elements.js";

function addImportOrderPathGroup(config, pathGroup) {
  const block = findRuleBlock(config, "import-x/order");
  if (!block) {
    throw new Error(
      "RepoAtlas Kukla2D extension requires the portable import-x/order config block.",
    );
  }

  const orderRule = block.rules["import-x/order"];
  const options = Array.isArray(orderRule) ? orderRule[1] : undefined;
  if (!options || typeof options !== "object") {
    throw new Error(
      "RepoAtlas Kukla2D extension requires import-x/order options to be configurable.",
    );
  }
  options.pathGroups ??= [];
  appendUnique(options.pathGroups, [pathGroup]);
}

/** Compose every Kukla2D-owned rule from its dedicated implementation file. */
export function composeCustomRules({ config, context, registry } = {}) {
  if (!Array.isArray(config)) {
    throw new TypeError(
      "RepoAtlas Kukla2D extension expects a flat config array.",
    );
  }

  const { source, features, packages } = repositoryPaths(context);
  const alias = repositoryAlias(context);
  const live2dIgnores = applyLive2dIgnores(config, { source, packages });

  addImportOrderPathGroup(config, createImportOrderPathGroup());

  const boundariesBlock = findBoundariesBlock(config);
  appendUnique(
    boundariesBlock.settings["boundaries/elements"],
    createWorkspaceElements({ packages }),
  );

  appendPolicies(boundariesBlock, [
    createArchRs2Policy({ alias }),
    ...createArchRs3Policies(),
    createArchRs4Policy({ alias }),
    createArchRs5Policy({ alias }),
    ...createDomainDependencyPolicies({ alias, registry }),
    createModularSpriteCompositionException({ features }),
    createEditorModalException({ source, alias }),
  ]);

  appendConfigBlock(config, createArchRs1Block({ source, features }));
  appendConfigBlock(config, createArchRs6Block({ features }));

  const canvasJavaScriptPattern = `${features}/canvas/**/*.{js,jsx}`;
  const hasCanvasPropTypesOverride = config.some(
    (entry) =>
      entry?.files?.includes(canvasJavaScriptPattern) &&
      entry.rules?.["react/prop-types"] === "off",
  );
  if (!hasCanvasPropTypesOverride) {
    appendConfigBlock(config, createCanvasPropTypesBlock({ features }));
  }

  appendConfigBlock(
    config,
    createArchRs7Block({ source, packages, ignores: live2dIgnores }),
  );
  appendConfigBlock(config, createAppVersionGlobalBlock());

  return config;
}
