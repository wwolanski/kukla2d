import { canvasMaxLines } from "./canvas-max-lines.js";
import { canvasUiToLegacyIo } from "./canvas-ui-to-legacy-io.js";
import { domainBrowserGlobal } from "./domain-browser-global.js";
import { identifierDenylist } from "./identifier-denylist.js";
import { legacyFeatureComponent } from "./legacy-feature-component.js";
import { modularSpriteToGlobalStore } from "./modular-sprite-to-global-store.js";
import { workspacePackageDependency } from "./workspace-package-dependency.js";

export const repositoryPolicyMessages = {
  domainBrowserGlobal,
  modularSpriteToGlobalStore,
  workspacePackageDependency,
  legacyFeatureComponent,
  canvasUiToLegacyIo,
  canvasMaxLines,
  identifierDenylist,
};
