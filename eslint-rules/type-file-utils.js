import path from "node:path";

export function isTypeScriptImplementationFile(filename) {
  return /\.(?:ts|tsx)$/.test(filename) && !filename.endsWith(".d.ts");
}

export function isInsideTypesDirectory(filename) {
  let directory = path.dirname(path.resolve(filename));

  while (true) {
    if (path.basename(directory) === "types") return true;
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

export function isDedicatedTypeFile(filename) {
  if (!isTypeScriptImplementationFile(filename) || !filename.endsWith(".ts"))
    return false;
  return (
    path.basename(filename).endsWith(".types.ts") ||
    isInsideTypesDirectory(filename)
  );
}

export function isTypeDeclaration(node) {
  return (
    node?.type === "TSInterfaceDeclaration" ||
    node?.type === "TSTypeAliasDeclaration"
  );
}

export function typeDeclarationName(node) {
  return node?.id?.name ?? "default";
}
