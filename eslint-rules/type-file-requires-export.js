import {
  isDedicatedTypeFile,
  isTypeDeclaration,
  isTypeScriptImplementationFile,
} from "./type-file-utils.js";

function hasTypeOnlyReExport(statement) {
  if (statement.type === "ExportAllDeclaration")
    return statement.exportKind === "type";
  if (statement.type !== "ExportNamedDeclaration") return false;
  if (isTypeDeclaration(statement.declaration)) return true;
  if (statement.exportKind === "type") return statement.specifiers.length > 0;
  if (statement.specifiers.length === 0) return false;
  return statement.specifiers.every(
    (specifier) =>
      specifier.type === "ExportSpecifier" && specifier.exportKind === "type",
  );
}

function declaredTypeNames(program) {
  const names = new Set();

  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;

    if (isTypeDeclaration(declaration) && declaration.id?.name) {
      names.add(declaration.id.name);
    }
  }

  return names;
}

function exportsDeclaredType(statement, declarations) {
  if (statement.type !== "ExportNamedDeclaration" || statement.source)
    return false;
  if (isTypeDeclaration(statement.declaration)) return true;

  return statement.specifiers.some(
    (specifier) =>
      specifier.type === "ExportSpecifier" &&
      declarations.has(specifier.local.name),
  );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require dedicated type files to expose a type contract or type-only barrel.",
    },
    schema: [],
    messages: {
      missingTypeExport:
        "TYPE-007: Dedicated type file contains no file-exported type contract or type-only re-export.\nReason: *.types.ts and types/** are reserved for declarations intentionally exposed beyond their own file, or for type-only barrels.\nFix: Move purely local type/interface declarations next to the implementation that uses them, or export the intended type contract from this file.",
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
        const declarations = declaredTypeNames(program);
        const hasContract = program.body.some(
          (statement) =>
            hasTypeOnlyReExport(statement) ||
            exportsDeclaredType(statement, declarations),
        );
        if (hasContract) return;

        context.report({
          node: program,
          messageId: "missingTypeExport",
        });
      },
    };
  },
};
