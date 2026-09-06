import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { moduleRootForPublicApi } from "./module-public-api.js";
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

function hasModifier(node, kind) {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined;
  return Boolean(modifiers?.some((modifier) => modifier.kind === kind));
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
  const bindings = new Map();
  const aliasCandidates = new Map();
  const localExports = [];
  const variables = [];
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
      if (clause?.name) {
        bindings.set(clause.name.text, {
          kind: "source",
          importedName: "default",
          source,
        });
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          bindings.set(element.name.text, {
            kind: "source",
            importedName: element.propertyName?.text ?? element.name.text,
            source,
          });
        }
      }
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        bindings.set(clause.namedBindings.name.text, {
          kind: "source",
          importedName: "*",
          source,
        });
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
          addExplicit(exportedName, {
            importedName,
            source,
          });
        } else {
          localExports.push({ exportedName, localName: importedName });
        }
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals && ts.isIdentifier(statement.expression)) {
        localExports.push({
          exportedName: "default",
          localName: statement.expression.text,
        });
      } else {
        local.add("default");
      }
      continue;
    }

    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const defaulted = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);

    if (ts.isVariableStatement(statement)) {
      const isConst =
        (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        variables.push({
          exported,
          isConst,
          name: declaration.name.text,
          initializer: declaration.initializer,
        });
      }
      continue;
    }

    if (
      "name" in statement &&
      statement.name &&
      ts.isIdentifier(statement.name)
    ) {
      bindings.set(statement.name.text, { kind: "own" });
      if (exported && !defaulted) local.add(statement.name.text);
    }
    if (defaulted && exported) local.add("default");
  }

  for (const variable of variables) {
    if (
      variable.isConst &&
      variable.initializer &&
      ts.isIdentifier(variable.initializer)
    ) {
      aliasCandidates.set(variable.name, variable.initializer.text);
    } else {
      bindings.set(variable.name, { kind: "own" });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, targetName] of aliasCandidates) {
      if (bindings.has(name)) continue;
      if (!bindings.has(targetName)) continue;
      bindings.set(name, { kind: "alias", targetName });
      changed = true;
    }
  }
  for (const name of aliasCandidates.keys()) {
    if (!bindings.has(name)) bindings.set(name, { kind: "own" });
  }

  const resolveBinding = (name, visited = new Set()) => {
    if (visited.has(name)) return { kind: "ambiguous" };
    const binding = bindings.get(name);
    if (!binding) return { kind: "unknown" };
    if (binding.kind !== "alias") return binding;
    return resolveBinding(binding.targetName, new Set(visited).add(name));
  };

  const addLocalExport = (exportedName, localName) => {
    const binding = resolveBinding(localName);
    if (binding.kind === "source") {
      addExplicit(exportedName, binding);
    } else {
      local.add(exportedName);
    }
  };

  for (const variable of variables) {
    if (variable.exported) addLocalExport(variable.name, variable.name);
  }
  for (const entry of localExports) {
    addLocalExport(entry.exportedName, entry.localName);
  }

  const module = {
    explicit,
    local,
    moduleStatements,
    sourceFile,
    stars,
  };
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

function relativeDisplayPath(moduleRoot, filePath) {
  return path.relative(moduleRoot, filePath).split(path.sep).join("/");
}

function forwardResult(passThroughFile, result) {
  if (result.kind === "own") {
    return {
      kind: "forward",
      passThroughFile,
      sourceFile: result.sourceFile,
    };
  }
  return result;
}

function createTracer({ cwd, moduleRoot }) {
  const namedCache = new Map();

  const traceTarget = (filePath, entry, visited) => {
    const target = resolveModule(filePath, entry.source, cwd);
    if (!target || !isInside(moduleRoot, target)) return { kind: "absent" };
    return forwardResult(
      filePath,
      traceNamed(target, entry.importedName, visited),
    );
  };

  const traceNamed = (filePath, exportName, visited = new Set()) => {
    const key = `${filePath}\0${exportName}`;
    if (visited.has(key)) return { kind: "ambiguous" };
    if (namedCache.has(key)) return namedCache.get(key);
    const nextVisited = new Set(visited).add(key);
    const module = readModule(filePath);
    if (!module) return { kind: "absent" };

    const explicitEntries = module.explicit.get(exportName) ?? [];
    let result;
    if (module.local.has(exportName) || explicitEntries.length > 1) {
      result =
        explicitEntries.length > 0
          ? { kind: "ambiguous" }
          : { kind: "own", sourceFile: filePath };
    } else if (explicitEntries.length === 1) {
      result = traceTarget(filePath, explicitEntries[0], nextVisited);
    } else {
      const starResults = module.stars
        .map((specifier) => {
          const target = resolveModule(filePath, specifier, cwd);
          if (!target || !isInside(moduleRoot, target)) {
            return { kind: "absent" };
          }
          return forwardResult(
            filePath,
            traceNamed(target, exportName, nextVisited),
          );
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
    if (!target || !isInside(moduleRoot, target)) return null;

    const nextVisited = new Set(visited).add(filePath);
    const nested = tracePureExportAll(target, nextVisited);
    if (nested) return nested;

    const targetModule = readModule(target);
    if (
      !targetModule ||
      targetModule.local.size === 0 ||
      targetModule.explicit.size > 0 ||
      targetModule.stars.length > 0
    ) {
      return null;
    }
    return {
      kind: "forward",
      passThroughFile: filePath,
      sourceFile: target,
    };
  };

  return { traceNamed, tracePureExportAll };
}

function nodeName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "Literal") return String(node.value);
  return null;
}

function rootBindingsFor(program) {
  const bindings = new Map();
  const aliasCandidates = new Map();

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const source = statement.source.value;
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportDefaultSpecifier") {
        bindings.set(specifier.local.name, {
          kind: "source",
          importedName: "default",
          source,
        });
      } else if (specifier.type === "ImportSpecifier") {
        bindings.set(specifier.local.name, {
          kind: "source",
          importedName: nodeName(specifier.imported),
          source,
        });
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        bindings.set(specifier.local.name, {
          kind: "source",
          importedName: "*",
          source,
        });
      }
    }
  }

  const addDeclaration = (declaration) => {
    if (!declaration) return;
    if (
      declaration.type === "FunctionDeclaration" ||
      declaration.type === "ClassDeclaration" ||
      declaration.type === "TSInterfaceDeclaration" ||
      declaration.type === "TSTypeAliasDeclaration" ||
      declaration.type === "TSEnumDeclaration"
    ) {
      if (declaration.id?.name) {
        bindings.set(declaration.id.name, { kind: "own" });
      }
      return;
    }
    if (declaration.type !== "VariableDeclaration") return;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== "Identifier") continue;
      if (
        declaration.kind === "const" &&
        declarator.init?.type === "Identifier"
      ) {
        aliasCandidates.set(declarator.id.name, declarator.init.name);
      } else {
        bindings.set(declarator.id.name, { kind: "own" });
      }
    }
  };

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") continue;
    if (statement.type === "ExportNamedDeclaration") {
      addDeclaration(statement.declaration);
    } else if (statement.type === "ExportDefaultDeclaration") {
      if (
        statement.declaration.type === "FunctionDeclaration" ||
        statement.declaration.type === "ClassDeclaration"
      ) {
        addDeclaration(statement.declaration);
      }
    } else {
      addDeclaration(statement);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, targetName] of aliasCandidates) {
      if (bindings.has(name)) continue;
      if (!bindings.has(targetName)) continue;
      bindings.set(name, { kind: "alias", targetName });
      changed = true;
    }
  }
  for (const name of aliasCandidates.keys()) {
    if (!bindings.has(name)) bindings.set(name, { kind: "own" });
  }

  const resolve = (name, visited = new Set()) => {
    if (visited.has(name)) return { kind: "ambiguous" };
    const binding = bindings.get(name);
    if (!binding) return { kind: "unknown" };
    if (binding.kind !== "alias") return binding;
    return resolve(binding.targetName, new Set(visited).add(name));
  };

  return { resolve };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow module public API symbols exposed through pass-through forwarding layers.",
    },
    schema: [],
    messages: {
      passThrough: architectureMessages.passThrough.message,
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    const moduleRoot = moduleRootForPublicApi(filename);
    if (!moduleRoot) return {};

    const cwd = context.cwd ?? process.cwd();
    const tracer = createTracer({ cwd, moduleRoot });

    const report = (node, symbol, result) => {
      context.report({
        node,
        messageId: "passThrough",
        data: {
          passThroughFile: relativeDisplayPath(
            moduleRoot,
            result.passThroughFile,
          ),
          sourceFile: relativeDisplayPath(moduleRoot, result.sourceFile),
          symbol,
        },
      });
    };

    const traceRootBinding = (binding) => {
      if (binding?.kind !== "source") return null;
      const target = resolveModule(filename, binding.source, cwd);
      if (!target || !isInside(moduleRoot, target)) return null;
      return forwardResult(
        filename,
        tracer.traceNamed(target, binding.importedName),
      );
    };

    return {
      "Program:exit"(program) {
        const bindings = rootBindingsFor(program);

        for (const statement of program.body) {
          if (statement.type === "ExportAllDeclaration") {
            const target = resolveModule(filename, statement.source.value, cwd);
            if (!target || !isInside(moduleRoot, target)) continue;
            const result = tracer.tracePureExportAll(target);
            if (result) report(statement.source, "*", result);
            continue;
          }

          if (statement.type === "ExportDefaultDeclaration") {
            const localName = nodeName(statement.declaration);
            const result = traceRootBinding(
              localName ? bindings.resolve(localName) : null,
            );
            if (result?.kind === "forward") {
              report(statement.declaration, "default", result);
            }
            continue;
          }

          if (statement.type !== "ExportNamedDeclaration") continue;

          if (statement.declaration?.type === "VariableDeclaration") {
            for (const declarator of statement.declaration.declarations) {
              const localName = nodeName(declarator.id);
              const result = traceRootBinding(
                localName ? bindings.resolve(localName) : null,
              );
              if (result?.kind === "forward") {
                report(declarator, localName, result);
              }
            }
          }

          for (const specifier of statement.specifiers) {
            if (specifier.type !== "ExportSpecifier") continue;
            const exportedName = nodeName(specifier.exported);
            const localName = nodeName(specifier.local);
            if (!exportedName || !localName) continue;

            if (statement.source) {
              const target = resolveModule(
                filename,
                statement.source.value,
                cwd,
              );
              if (!target || !isInside(moduleRoot, target)) continue;
              const result = tracer.traceNamed(target, localName);
              if (result.kind === "forward") {
                report(specifier, exportedName, result);
              }
            } else {
              const result = traceRootBinding(bindings.resolve(localName));
              if (result?.kind === "forward") {
                report(specifier, exportedName, result);
              }
            }
          }
        }
      },
    };
  },
};
