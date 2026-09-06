import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { typesMessages } from "../eslint-rules/lint-registry.js";

const DEFAULT_SOURCE_ROOTS = ["src", "packages"];
const DEFAULT_IGNORED_PREFIXES = [
  "src/io/live2d/",
  "packages/adapters/live2d/",
];

function normalizePath(value) {
  return value.replaceAll(path.sep, "/");
}

function relativePath(root, value) {
  return normalizePath(path.relative(root, value));
}

function isInsideSourceRoots(relativeFile, sourceRoots) {
  return sourceRoots.some(
    (root) => relativeFile === root || relativeFile.startsWith(`${root}/`),
  );
}

function isProductionSourceFile(
  root,
  sourceFile,
  sourceRoots,
  ignoredPrefixes,
) {
  if (sourceFile.isDeclarationFile || !/\.tsx?$/.test(sourceFile.fileName))
    return false;
  const relativeFile = relativePath(root, sourceFile.fileName);
  return (
    isInsideSourceRoots(relativeFile, sourceRoots) &&
    !ignoredPrefixes.some((prefix) => relativeFile.startsWith(prefix))
  );
}

function isDedicatedTypeFile(fileName) {
  if (!fileName.endsWith(".ts") || fileName.endsWith(".d.ts")) return false;
  if (path.basename(fileName).endsWith(".types.ts")) return true;
  return normalizePath(fileName).split("/").includes("types");
}

function isTypeDeclaration(node) {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

function canonicalSymbol(checker, symbol) {
  let current = symbol;
  const visited = new Set();
  while (
    current &&
    (current.flags & ts.SymbolFlags.Alias) !== 0 &&
    !visited.has(current)
  ) {
    visited.add(current);
    current = checker.getAliasedSymbol(current);
  }
  return current;
}

function moduleExports(checker, sourceFile) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return [];
  return checker.getExportsOfModule(moduleSymbol);
}

function exportedTargetSymbols(checker, sourceFile) {
  return new Set(
    moduleExports(checker, sourceFile).map((symbol) =>
      canonicalSymbol(checker, symbol),
    ),
  );
}

function isInsideImportOrExport(node) {
  let current = node.parent;
  while (current) {
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current))
      return true;
    if (ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

function isDeclarationName(node) {
  const parent = node.parent;
  return isTypeDeclaration(parent) && parent.name === node;
}

function collectPackageJsonFiles(directory, result = []) {
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectPackageJsonFiles(entryPath, result);
    else if (entry.name === "package.json") result.push(entryPath);
  }
  return result;
}

function collectTypeEntrypoints(value, result = []) {
  if (typeof value === "string") {
    if (/\.tsx?$/.test(value)) result.push(value);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  if (typeof value.types === "string")
    collectTypeEntrypoints(value.types, result);
  else
    for (const child of Object.values(value))
      collectTypeEntrypoints(child, result);
  return result;
}

export function discoverPublicApiFiles(root) {
  const publicApiFiles = new Set();
  const featuresRoot = path.join(root, "src", "features");
  if (fs.existsSync(featuresRoot)) {
    for (const entry of fs.readdirSync(featuresRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entrypoint = path.join(featuresRoot, entry.name, "index.ts");
      if (fs.existsSync(entrypoint))
        publicApiFiles.add(path.resolve(entrypoint));
    }
  }

  for (const packageJsonPath of collectPackageJsonFiles(
    path.join(root, "packages"),
  )) {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    } catch (error) {
      throw new Error(
        `Cannot read ${relativePath(root, packageJsonPath)}: ${error.message}`,
      );
    }
    const packageRoot = path.dirname(packageJsonPath);
    for (const entrypoint of collectTypeEntrypoints(manifest.exports)) {
      const resolved = path.resolve(packageRoot, entrypoint);
      if (fs.existsSync(resolved)) publicApiFiles.add(resolved);
    }
    if (typeof manifest.types === "string") {
      const resolved = path.resolve(packageRoot, manifest.types);
      if (fs.existsSync(resolved)) publicApiFiles.add(resolved);
    }
  }
  return [...publicApiFiles];
}

function loadProgram(root, tsconfigPath) {
  const configPath = path.resolve(root, tsconfigPath);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.formatDiagnostic(config.error, diagnosticHost(root)));
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );
  if (parsed.errors.length > 0) {
    throw new Error(ts.formatDiagnostics(parsed.errors, diagnosticHost(root)));
  }
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

function diagnosticHost(root) {
  return {
    getCanonicalFileName: (fileName) => relativePath(root, fileName),
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  };
}

function lineAndColumn(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { line: position.line + 1, column: position.character + 1 };
}

function createDiagnostic(
  code,
  declaration,
  sourceFile,
  root,
  consumers,
  publicContract,
) {
  const location = lineAndColumn(sourceFile, declaration.name);
  return {
    code,
    name: declaration.name.text,
    file: relativePath(root, sourceFile.fileName),
    ...location,
    consumers: [...consumers]
      .map((fileName) => relativePath(root, fileName))
      .sort(),
    publicContract,
  };
}

export function analyzeTypeLocality({
  root = process.cwd(),
  tsconfigPath = "tsconfig.json",
  sourceRoots = DEFAULT_SOURCE_ROOTS,
  ignoredPrefixes = DEFAULT_IGNORED_PREFIXES,
  publicApiFiles,
} = {}) {
  const absoluteRoot = path.resolve(root);
  const program = loadProgram(absoluteRoot, tsconfigPath);
  const checker = program.getTypeChecker();
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) =>
      isProductionSourceFile(
        absoluteRoot,
        sourceFile,
        sourceRoots,
        ignoredPrefixes,
      ),
    );
  const sourceFileSet = new Set(
    sourceFiles.map((sourceFile) => path.resolve(sourceFile.fileName)),
  );
  const resolvedPublicApiFiles = (
    publicApiFiles ?? discoverPublicApiFiles(absoluteRoot)
  )
    .map((fileName) => path.resolve(absoluteRoot, fileName))
    .filter((fileName) => sourceFileSet.has(fileName));

  const publicSymbols = new Set();
  for (const fileName of resolvedPublicApiFiles) {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) continue;
    for (const symbol of moduleExports(checker, sourceFile)) {
      publicSymbols.add(canonicalSymbol(checker, symbol));
    }
  }

  const contracts = new Map();
  for (const sourceFile of sourceFiles) {
    const exportedSymbols = exportedTargetSymbols(checker, sourceFile);
    for (const statement of sourceFile.statements) {
      const declaration = ts.isExportAssignment(statement)
        ? null
        : ts.isInterfaceDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement)
          ? statement
          : null;
      if (!declaration?.name) continue;
      const symbol = canonicalSymbol(
        checker,
        checker.getSymbolAtLocation(declaration.name),
      );
      if (!symbol || !exportedSymbols.has(symbol)) continue;
      contracts.set(symbol, {
        declaration,
        sourceFile,
        consumers: new Set(),
        dedicated: isDedicatedTypeFile(sourceFile.fileName),
        publicContract: publicSymbols.has(symbol),
      });
    }
  }

  for (const sourceFile of sourceFiles) {
    function visit(node) {
      if (
        ts.isIdentifier(node) &&
        !isDeclarationName(node) &&
        !isInsideImportOrExport(node)
      ) {
        const symbol = canonicalSymbol(
          checker,
          checker.getSymbolAtLocation(node),
        );
        const contract = symbol ? contracts.get(symbol) : undefined;
        if (contract) contract.consumers.add(path.resolve(sourceFile.fileName));
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  const diagnostics = [];
  for (const contract of contracts.values()) {
    const { declaration, sourceFile, dedicated, publicContract } = contract;
    const consumers = new Set(contract.consumers);
    if (dedicated) consumers.delete(path.resolve(sourceFile.fileName));

    if (publicContract) {
      if (!dedicated)
        diagnostics.push(
          createDiagnostic(
            "TYPE-001",
            declaration,
            sourceFile,
            absoluteRoot,
            consumers,
            true,
          ),
        );
      continue;
    }

    if (dedicated) {
      if (consumers.size === 0)
        diagnostics.push(
          createDiagnostic(
            "TYPE-003",
            declaration,
            sourceFile,
            absoluteRoot,
            consumers,
            false,
          ),
        );
      else if (consumers.size === 1)
        diagnostics.push(
          createDiagnostic(
            "TYPE-004",
            declaration,
            sourceFile,
            absoluteRoot,
            consumers,
            false,
          ),
        );
      continue;
    }

    if (consumers.size >= 2) {
      diagnostics.push(
        createDiagnostic(
          "TYPE-001",
          declaration,
          sourceFile,
          absoluteRoot,
          consumers,
          false,
        ),
      );
    } else if (
      consumers.size === 0 ||
      consumers.has(path.resolve(sourceFile.fileName))
    ) {
      diagnostics.push(
        createDiagnostic(
          "TYPE-003",
          declaration,
          sourceFile,
          absoluteRoot,
          consumers,
          false,
        ),
      );
    } else {
      diagnostics.push(
        createDiagnostic(
          "TYPE-004",
          declaration,
          sourceFile,
          absoluteRoot,
          consumers,
          false,
        ),
      );
    }
  }

  return diagnostics.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.code.localeCompare(right.code),
  );
}

export function formatTypeLocalityDiagnostic(diagnostic) {
  const definition = Object.values(typesMessages).find(
    (message) => message.code === diagnostic.code,
  );
  if (!definition)
    throw new Error(
      `Unknown type-locality diagnostic code: ${diagnostic.code}`,
    );
  const replacements = {
    name: diagnostic.name,
    consumer: diagnostic.consumers[0] ?? "none",
  };
  const message = definition.message.replaceAll(
    /\{\{(\w+)\}\}/g,
    (_match, key) => replacements[key] ?? key,
  );
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}  error  ${message}`;
}

function paint(enabled, open, close, value) {
  return enabled ? `\u001B[${open}m${value}\u001B[${close}m` : value;
}

export function shouldUseColor({
  stream = process.stderr,
  env = process.env,
} = {}) {
  if ("NO_COLOR" in env || env.FORCE_COLOR === "0") return false;
  if ("FORCE_COLOR" in env) return true;
  return stream.isTTY === true;
}

export function formatTypeLocalityReport(
  diagnostics,
  { root = process.cwd(), color = shouldUseColor() } = {},
) {
  if (diagnostics.length === 0) return "Type locality: no violations";
  const groups = new Map();
  for (const diagnostic of diagnostics) {
    const entries = groups.get(diagnostic.file) ?? [];
    entries.push(diagnostic);
    groups.set(diagnostic.file, entries);
  }

  const lines = [];
  for (const [file, entries] of groups) {
    const absoluteFile = path.resolve(root, file);
    lines.push(paint(color, "4", "24", absoluteFile));
    for (const diagnostic of entries) {
      const rendered = formatTypeLocalityDiagnostic(diagnostic);
      const message = rendered.slice(
        rendered.indexOf("  error  ") + "  error  ".length,
      );
      const [summary, ...details] = message.split("\n");
      const location = `${diagnostic.line}:${diagnostic.column}`.padStart(7);
      lines.push(
        `  ${paint(color, "2", "22", location)}  ${paint(color, "31", "39", "error")}  ${summary}  ${paint(color, "2", "22", "type-locality")}`,
      );
      for (const detail of details) lines.push(`           ${detail}`);
    }
    lines.push("");
  }

  const summary = `✖ ${diagnostics.length} problem${diagnostics.length === 1 ? "" : "s"} (${diagnostics.length} error${diagnostics.length === 1 ? "" : "s"}, 0 warnings)`;
  lines.push(paint(color, "1;31", "22;39", summary));
  return lines.join("\n");
}
