import { composeCustomRules } from "./rules/index.js";

/**
 * Adapt the portable config API to the repository-owned rule composer.
 * All Kukla2D policies live under rules/; this module only forwards context.
 */
export function extendConfig({ config, context, registry } = {}) {
  return composeCustomRules({ config, context, registry });
}
