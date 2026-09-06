import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { architectureMessages } from "./lint-registry.js";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const parsedFileCache = new Map();

function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function scriptKind(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function readModule(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }

  const cached = parsedFileCache.get(filePath);
  if (cached?.mtimeMs === stat.mtimeMs && cached.size === stat.size)
    return cached.module;

  let sourceText;
  try {
    sourceText = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const explicit = new Map();
  const local = new Set();
  const imports = new Map();
  const stars = [];
  const moduleStatements = [];

  const addExplicit = (exportedName, entry) => {
    const entries = explicit.get(exportedName) ?? [];
    entries.push(entry);
    explicit.set(exportedName, entries);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const source = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (clause?.name)
        imports.set(clause.name.text, { importedName: "default", source });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imports.set(element.name.text, {
            importedName: element.propertyName?.text ?? element.name.text,
            source,
          });
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      moduleStatements.push(statement);
      const source = statement.moduleSpecifier?.text;
      if (!statement.exportClause) {
        if (source) stars.push(source);
        continue;
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;

      for (const element of statement.exportClause.elements) {
        const exportedName = element.name.text;
        const importedName = element.propertyName?.text ?? element.name.text;
        if (source) {
          addExplicit(exportedName, { importedName, source });
          continue;
        }
        const imported = imports.get(importedName);
        if (imported) addExplicit(exportedName, imported);
        else local.add(exportedName);
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      local.add("default");
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    if (
      !modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    )
      continue;

    if (
      modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      local.add("default");
    }
    if (
      "name" in statement &&
      statement.name &&
      ts.isIdentifier(statement.name)
    ) {
      local.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) local.add(declaration.name.text);
      }
    }
  }

  const module = { explicit, local, moduleStatements, sourceFile, stars };
  parsedFileCache.set(filePath, {
    module,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  });
  return module;
}

function resolveModule(importerPath, specifier, cwd) {
  const cleanSpecifier = specifier.replace(/[?#].*$/, "");
  let unresolved;
  if (cleanSpecifier.startsWith(".")) {
    unresolved = path.resolve(path.dirname(importerPath), cleanSpecifier);
  } else if (cleanSpecifier.startsWith("@/")) {
    unresolved = path.resolve(cwd, "src", cleanSpecifier.slice(2));
  } else {
    return null;
  }

  const extension = path.extname(unresolved);
  const basePath = extension
    ? unresolved.slice(0, -extension.length)
    : unresolved;
  const candidates = extension
    ? [
        ...SOURCE_EXTENSIONS.map(
          (candidateExtension) => `${basePath}${candidateExtension}`,
        ),
        unresolved,
      ]
    : [
        ...SOURCE_EXTENSIONS.map(
          (candidateExtension) => `${unresolved}${candidateExtension}`,
        ),
        ...SOURCE_EXTENSIONS.map((candidateExtension) =>
          path.join(unresolved, `index${candidateExtension}`),
        ),
      ];

  for (const candidate of [...new Set(candidates)]) {
    try {
      if (fs.statSync(candidate).isFile()) return path.normalize(candidate);
    } catch {
      // An unresolved candidate is expected while applying extension aliases.
    }
  }
  return null;
}

function relativeDisplayPath(featureRoot, filePath) {
  return path.relative(featureRoot, filePath).split(path.sep).join("/");
}

function createTracer({ cwd, featureRoot }) {
  const applicationRoot = path.join(featureRoot, "application");
  const domainRoot = path.join(featureRoot, "domain");
  const namedCache = new Map();

  const domainExportsName = (filePath, exportName, visited = new Set()) => {
    const key = `${filePath}\0${exportName}`;
    if (visited.has(key)) return false;
    visited.add(key);
    const module = readModule(filePath);
    if (!module) return false;
    if (module.local.has(exportName) || module.explicit.has(exportName))
      return true;
    return module.stars.some((specifier) => {
      const target = resolveModule(filePath, specifier, cwd);
      return target && isInside(domainRoot, target)
        ? domainExportsName(target, exportName, new Set(visited))
        : false;
    });
  };

  const traceTarget = (applicationFile, importedName, specifier, visited) => {
    const target = resolveModule(applicationFile, specifier, cwd);
    if (!target) return { kind: "absent" };
    if (isInside(domainRoot, target)) {
      return {
        applicationFile,
        domainFile: target,
        domainSymbol: importedName,
        kind: "domain",
      };
    }
    if (!isInside(applicationRoot, target)) return { kind: "other" };
    return traceNamed(target, importedName, visited);
  };

  const traceNamed = (filePath, exportName, visited = new Set()) => {
    const key = `${filePath}\0${exportName}`;
    if (visited.has(key)) return { kind: "ambiguous" };
    if (namedCache.has(key)) return namedCache.get(key);
    const nextVisited = new Set(visited).add(key);
    const module = readModule(filePath);
    if (!module) return { kind: "absent" };

    let result;
    const explicitEntries = module.explicit.get(exportName) ?? [];
    if (module.local.has(exportName) || explicitEntries.length > 1) {
      result = { kind: explicitEntries.length > 0 ? "ambiguous" : "own" };
    } else if (explicitEntries.length === 1) {
      const entry = explicitEntries[0];
      result = traceTarget(
        filePath,
        entry.importedName,
        entry.source,
        nextVisited,
      );
    } else {
      const starResults = module.stars
        .map((specifier) => {
          const target = resolveModule(filePath, specifier, cwd);
          if (!target) return { kind: "absent" };
          if (isInside(domainRoot, target)) {
            return domainExportsName(target, exportName)
              ? {
                  applicationFile: filePath,
                  domainFile: target,
                  domainSymbol: exportName,
                  kind: "domain",
                }
              : { kind: "absent" };
          }
          if (!isInside(applicationRoot, target)) return { kind: "other" };
          return traceNamed(target, exportName, nextVisited);
        })
        .filter((candidate) => candidate.kind !== "absent");
      result =
        starResults.length === 0
          ? { kind: "absent" }
          : starResults.length === 1
            ? starResults[0]
            : { kind: "ambiguous" };
    }

    namedCache.set(key, result);
    return result;
  };

  const tracePureExportAll = (filePath, visited = new Set()) => {
    if (visited.has(filePath)) return null;
    const module = readModule(filePath);
    if (
      !module ||
      module.sourceFile.statements.length !== 1 ||
      module.moduleStatements.length !== 1
    ) {
      return null;
    }
    const [statement] = module.moduleStatements;
    if (statement.exportClause || !statement.moduleSpecifier) return null;
    const target = resolveModule(filePath, statement.moduleSpecifier.text, cwd);
    if (!target) return null;
    if (isInside(domainRoot, target)) {
      return {
        applicationFile: filePath,
        domainFile: target,
        domainSymbol: "*",
      };
    }
    if (!isInside(applicationRoot, target)) return null;
    return tracePureExportAll(target, new Set(visited).add(filePath));
  };

  return { relativeDisplayPath, traceNamed, tracePureExportAll };
}

function featureRootFor(filename) {
  const normalized = path.resolve(filename);
  if (!/^index\.(?:ts|tsx|js|jsx)$/.test(path.basename(normalized)))
    return null;
  const featureRoot = path.dirname(normalized);
  const parentParts = path.dirname(featureRoot).split(path.sep);
  if (parentParts.at(-1) !== "features" || parentParts.at(-2) !== "src")
    return null;
  return featureRoot;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Domain symbols exposed through pass-through Application re-exports.",
    },
    schema: [],
    messages: {
      passThrough: architectureMessages.passThrough.message,
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    const featureRoot = featureRootFor(filename);
    if (!featureRoot) return {};

    const cwd = context.cwd ?? process.cwd();
    const applicationRoot = path.join(featureRoot, "application");
    const tracer = createTracer({ cwd, featureRoot });

    const report = (node, symbol, result) => {
      context.report({
        node,
        messageId: "passThrough",
        data: {
          applicationFile: relativeDisplayPath(
            featureRoot,
            result.applicationFile,
          ),
          domainFile: relativeDisplayPath(featureRoot, result.domainFile),
          symbol,
        },
      });
    };

    return {
      ExportAllDeclaration(node) {
        const target = resolveModule(filename, node.source.value, cwd);
        if (!target || !isInside(applicationRoot, target)) return;
        const result = tracer.tracePureExportAll(target);
        if (result) report(node.source, "*", result);
      },
      ExportNamedDeclaration(node) {
        if (!node.source || node.specifiers.length === 0) return;
        const target = resolveModule(filename, node.source.value, cwd);
        if (!target || !isInside(applicationRoot, target)) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ExportSpecifier") continue;
          const importedName = specifier.local.name ?? specifier.local.value;
          const exportedName =
            specifier.exported.name ?? specifier.exported.value;
          const result = tracer.traceNamed(target, importedName);
          if (result.kind === "domain") report(specifier, exportedName, result);
        }
      },
    };
  },
};
