const DEFAULT_PATHS = {
  source: "src",
  features: "src/features",
  packages: "packages",
  tests: "test",
};

export function normalizePath(value) {
  const normalized = String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  return normalized.replace(/\/$/, "") || ".";
}

function getContextConfig(context) {
  if (context?.config && typeof context.config === "object") {
    return context.config;
  }
  if (context?.effectiveConfig && typeof context.effectiveConfig === "object") {
    return context.effectiveConfig;
  }
  return context ?? {};
}

export function repositoryPaths(context) {
  const contextConfig = getContextConfig(context);
  const paths = contextConfig.paths ?? context?.paths ?? {};
  return {
    source: normalizePath(
      paths.source ?? context?.source ?? DEFAULT_PATHS.source,
    ),
    features: normalizePath(
      paths.features ?? context?.features ?? DEFAULT_PATHS.features,
    ),
    packages: normalizePath(
      paths.packages ?? context?.packages ?? DEFAULT_PATHS.packages,
    ),
    tests: normalizePath(paths.tests ?? context?.tests ?? DEFAULT_PATHS.tests),
  };
}

export function repositoryAlias(context) {
  const contextConfig = getContextConfig(context);
  return normalizePath(contextConfig.alias ?? context?.alias ?? "@");
}

export function architectureMessage(registry, name, fallback) {
  const messages =
    registry?.architecture ??
    registry?.architectureMessages ??
    registry?.messages?.architecture ??
    registry?.lintMessageRegistry?.architecture ??
    {};
  const entry = messages[name];
  if (typeof entry === "string") return entry;
  return entry?.message ?? fallback;
}

function serialize(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object") return nested;
    if (seen.has(nested)) return "[Circular]";
    seen.add(nested);
    return nested;
  });
}

export function equivalent(left, right) {
  return serialize(left) === serialize(right);
}

export function appendUnique(list, values) {
  for (const value of values) {
    if (!list.some((existing) => equivalent(existing, value))) list.push(value);
  }
}

export function appendConfigBlock(config, block) {
  if (!config.some((existing) => equivalent(existing, block)))
    config.push(block);
}

export function findRuleBlock(config, ruleName) {
  return config.find((entry) => entry?.rules?.[ruleName]);
}

export function findBoundariesBlock(config) {
  const block = config.find(
    (entry) =>
      entry &&
      entry.settings?.["boundaries/elements"] &&
      entry.rules?.["boundaries/dependencies"],
  );
  if (!block) {
    throw new Error(
      "RepoAtlas Kukla2D extension requires the portable boundaries config block.",
    );
  }
  return block;
}

export function boundariesPolicies(boundariesBlock) {
  const dependenciesRule = boundariesBlock.rules["boundaries/dependencies"];
  if (!Array.isArray(dependenciesRule) || !dependenciesRule[1]) {
    throw new Error(
      "RepoAtlas Kukla2D extension requires boundaries/dependencies options.",
    );
  }
  dependenciesRule[1].policies ??= [];
  return dependenciesRule[1].policies;
}

export function appendPolicies(boundariesBlock, policies) {
  appendUnique(boundariesPolicies(boundariesBlock), policies);
}

export function appendIgnore(block, patterns) {
  block.ignores ??= [];
  appendUnique(block.ignores, patterns);
}
