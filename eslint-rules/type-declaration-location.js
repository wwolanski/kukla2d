import {
  isDedicatedTypeFile,
  isTypeDeclaration,
  isTypeScriptImplementationFile,
  typeDeclarationName,
} from "./type-file-utils.js";
import { typesMessages } from "./lint-registry.js";

function addDeclaration(declarations, node) {
  if (!isTypeDeclaration(node) || !node.id?.name) return;
  const entries = declarations.get(node.id.name) ?? [];
  entries.push(node);
  declarations.set(node.id.name, entries);
}

function localExportNames(node) {
  if (node.type !== "ExportNamedDeclaration" || node.source) return [];
  return node.specifiers
    .filter((specifier) => specifier.type === "ExportSpecifier")
    .map((specifier) => specifier.local?.name)
    .filter(Boolean);
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require file-exported type declarations to live in dedicated type files.",
    },
    schema: [],
    messages: {
      exportedTypeOutsideTypeFile:
        typesMessages.exportedTypeOutsideTypeFile.message,
    },
  },

  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    if (!isTypeScriptImplementationFile(filename)) return {};

    return {
      Program(program) {
        const declarations = new Map();
        const exportedDeclarations = new Set();

        for (const statement of program.body) {
          if (isTypeDeclaration(statement)) {
            addDeclaration(declarations, statement);
            continue;
          }

          if (
            statement.type === "ExportNamedDeclaration" &&
            isTypeDeclaration(statement.declaration)
          ) {
            addDeclaration(declarations, statement.declaration);
          } else if (
            statement.type === "ExportDefaultDeclaration" &&
            isTypeDeclaration(statement.declaration)
          ) {
            addDeclaration(declarations, statement.declaration);
          }
        }

        for (const statement of program.body) {
          if (
            statement.type === "ExportNamedDeclaration" &&
            isTypeDeclaration(statement.declaration)
          ) {
            exportedDeclarations.add(statement.declaration);
            continue;
          }

          if (
            statement.type === "ExportDefaultDeclaration" &&
            isTypeDeclaration(statement.declaration)
          ) {
            exportedDeclarations.add(statement.declaration);
            continue;
          }

          for (const name of localExportNames(statement)) {
            for (const declaration of declarations.get(name) ?? []) {
              exportedDeclarations.add(declaration);
            }
          }
        }

        if (isDedicatedTypeFile(filename)) return;

        for (const declaration of exportedDeclarations) {
          const name = typeDeclarationName(declaration);
          context.report({
            node: declaration,
            messageId: "exportedTypeOutsideTypeFile",
            data: { name },
          });
        }
      },
    };
  },
};
