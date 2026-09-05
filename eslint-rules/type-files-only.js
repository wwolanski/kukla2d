import {
  isDedicatedTypeFile,
  isTypeDeclaration,
  isTypeScriptImplementationFile,
} from "./type-file-utils.js";

function declarationLabel(node) {
  const labels = {
    VariableDeclaration: "variable",
    FunctionDeclaration: "function",
    TSDeclareFunction: "function",
    ClassDeclaration: "class",
    TSEnumDeclaration: "enum",
  };
  const label = labels[node.type] ?? node.type;
  if (node.type === "VariableDeclaration") {
    const names = node.declarations
      .map((declaration) => declaration.id?.name)
      .filter(Boolean);
    if (names.length > 0) return `${label} "${names.join(", ")}"`;
  }
  const name = node.id?.name;
  if (name) return `${label} "${name}"`;
  return label;
}

function reportLabel(node) {
  if (node.type === "ImportDeclaration") {
    return `runtime import from "${node.source.value}"`;
  }

  if (node.type === "ExportAllDeclaration") {
    return `runtime re-export from "${node.source.value}"`;
  }

  if (node.type === "ExportNamedDeclaration") {
    if (node.source) return `runtime re-export from "${node.source.value}"`;
    if (node.declaration) return declarationLabel(node.declaration);
    return "runtime export";
  }

  if (node.type === "ExportDefaultDeclaration" && node.declaration) {
    return declarationLabel(node.declaration);
  }

  if (node.type === "ExpressionStatement") return "side-effect statement";
  if (node.type === "VariableDeclaration") return declarationLabel(node);
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "TSDeclareFunction"
  ) {
    return declarationLabel(node);
  }
  if (node.type === "ClassDeclaration") return declarationLabel(node);
  if (node.type === "TSEnumDeclaration") return declarationLabel(node);
  return node.type;
}

function isExplicitTypeOnlyImport(node) {
  if (node.importKind === "type") return true;
  if (node.specifiers.length === 0) return false;
  return node.specifiers.every((specifier) => specifier.importKind === "type");
}

function isExplicitTypeOnlyExport(node) {
  if (node.type === "ExportAllDeclaration") return node.exportKind === "type";
  if (node.type !== "ExportNamedDeclaration") return false;
  if (isTypeDeclaration(node.declaration)) return true;
  if (node.exportKind === "type") return true;
  if (node.specifiers.length === 0) return !node.source && !node.declaration;
  return node.specifiers.every(
    (specifier) =>
      specifier.type === "ExportSpecifier" && specifier.exportKind === "type",
  );
}

function isAllowedStatement(node) {
  if (isTypeDeclaration(node) || node.type === "EmptyStatement") return true;
  if (node.type === "ImportDeclaration") return isExplicitTypeOnlyImport(node);
  if (node.type === "ExportNamedDeclaration")
    return isExplicitTypeOnlyExport(node);
  if (node.type === "ExportAllDeclaration")
    return isExplicitTypeOnlyExport(node);
  if (
    node.type === "ExportDefaultDeclaration" &&
    isTypeDeclaration(node.declaration)
  )
    return true;
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reserve dedicated type files for compile-time type contracts.",
    },
    schema: [],
    messages: {
      runtimeConstruct:
        'TYPE-002: Runtime construct "{{construct}}" is not allowed in a dedicated type file.\nReason: *.types.ts and types/** are reserved exclusively for compile-time type contracts.\nFix: Move runtime values, functions, classes, enums, imports, re-exports or side effects to an implementation file.',
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    if (
      !isTypeScriptImplementationFile(filename) ||
      !isDedicatedTypeFile(filename)
    )
      return {};

    return {
      Program(program) {
        for (const statement of program.body) {
          if (isAllowedStatement(statement)) continue;
          context.report({
            node: statement,
            messageId: "runtimeConstruct",
            data: { construct: reportLabel(statement) },
          });
        }
      },
    };
  },
};
