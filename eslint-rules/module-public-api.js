import path from "node:path";

const MODULE_ROOT_FILE_PATTERN = /^index\.(?:ts|tsx|js|jsx)$/;

export function moduleRootForPublicApi(filename) {
  const normalized = path.resolve(filename);
  if (!MODULE_ROOT_FILE_PATTERN.test(path.basename(normalized))) return null;

  const moduleRoot = path.dirname(normalized);
  const featuresRoot = path.dirname(moduleRoot);
  if (path.basename(featuresRoot) !== "features") return null;
  if (path.basename(path.dirname(featuresRoot)) !== "src") return null;

  return moduleRoot;
}
