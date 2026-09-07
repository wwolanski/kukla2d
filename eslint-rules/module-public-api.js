import fs from "node:fs";
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

function collectManifestEntrypoints(value, result = []) {
  if (typeof value === "string") {
    result.push(value);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const child of Object.values(value)) {
    collectManifestEntrypoints(child, result);
  }
  return result;
}

function packageManifestFor(filename, cwd) {
  const root = path.resolve(cwd);
  let directory = path.dirname(path.resolve(filename));

  while (directory === root || directory.startsWith(`${root}${path.sep}`)) {
    const manifestPath = path.join(directory, "package.json");
    if (fs.existsSync(manifestPath)) return manifestPath;
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  return null;
}

function isPackageEntrypoint(filename, cwd) {
  const manifestPath = packageManifestFor(filename, cwd);
  if (!manifestPath) return false;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return false;
  }

  const entrypoints = collectManifestEntrypoints(manifest.exports);
  for (const field of ["main", "module", "types", "typings"]) {
    if (typeof manifest[field] === "string") entrypoints.push(manifest[field]);
  }

  const packageRoot = path.dirname(manifestPath);
  const normalizedFilename = path.normalize(path.resolve(filename));
  return entrypoints.some(
    (entrypoint) =>
      path.normalize(path.resolve(packageRoot, entrypoint)) ===
      normalizedFilename,
  );
}

export function isDesignatedPublicApi(filename, cwd = process.cwd()) {
  if (!filename || filename === "<input>" || filename === "<text>") {
    return false;
  }
  return (
    Boolean(moduleRootForPublicApi(filename)) ||
    isPackageEntrypoint(filename, cwd)
  );
}
