import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const sourceRoot = resolve(root, "src");
const sourceFilePattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const relativeSpecifierPattern = /^\.{1,2}(?:\/|$)/;
const regexAfterWords = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const check = args.has("--check") || !write;
const unsupportedArgs = [...args].filter(
  (arg) => arg !== "--write" && arg !== "--check",
);

if (unsupportedArgs.length > 0 || (write && args.has("--check"))) {
  console.error(
    "Usage: node scripts/fix-relative-import-aliases.mjs [--check|--write]",
  );
  process.exit(1);
}

function collectSourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(filePath, files);
    } else if (sourceFilePattern.test(entry.name)) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function skipQuoted(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
    } else if (source[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function skipLineComment(source, start) {
  const newline = source.indexOf("\n", start + 2);
  return newline === -1 ? source.length : newline + 1;
}

function skipBlockComment(source, start) {
  const end = source.indexOf("*/", start + 2);
  return end === -1 ? source.length : end + 2;
}

function skipRegex(source, start) {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const character = source[index];
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === "\n" || character === "\r") return null;
    if (character === "[") inCharacterClass = true;
    if (character === "]") inCharacterClass = false;
    if (character === "/" && !inCharacterClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] ?? "")) index += 1;
      return index;
    }
    index += 1;
  }
  return null;
}

function canStartRegex(previousToken) {
  if (!previousToken) return true;
  if (previousToken.kind === "word") {
    return regexAfterWords.has(previousToken.value);
  }
  if (previousToken.kind === "literal" || previousToken.kind === "template") {
    return false;
  }
  return ![")", "]", "}"].includes(previousToken.value);
}

function readTemplate(source, start) {
  let index = start + 1;
  let expressionDepth = 0;

  while (index < source.length) {
    const character = source[index];

    if (expressionDepth === 0) {
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === "`") return index + 1;
      if (character === "$" && source[index + 1] === "{") {
        expressionDepth = 1;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (character === "'" || character === '"') {
      index = skipQuoted(source, index);
      continue;
    }
    if (character === "`") {
      index = readTemplate(source, index);
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (character === "{") expressionDepth += 1;
    if (character === "}") expressionDepth -= 1;
    index += 1;
  }

  return source.length;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (character === "'" || character === '"') {
      const end = skipQuoted(source, index);
      tokens.push({
        kind: "literal",
        start: index,
        end,
        contentStart: index + 1,
        contentEnd: Math.max(index + 1, end - 1),
      });
      index = end;
      continue;
    }
    if (character === "`") {
      const end = readTemplate(source, index);
      tokens.push({
        kind: "template",
        start: index,
        end,
        contentStart: index + 1,
        contentEnd: Math.max(index + 1, end - 1),
      });
      index = end;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_$]/.test(source[index] ?? "")) index += 1;
      tokens.push({
        kind: "word",
        value: source.slice(start, index),
        start,
        end: index,
      });
      continue;
    }
    if (character === "/" && canStartRegex(tokens.at(-1))) {
      const end = skipRegex(source, index);
      if (end !== null) {
        index = end;
        continue;
      }
    }

    tokens.push({
      kind: "punctuation",
      value: character,
      start: index,
      end: index + 1,
    });
    index += 1;
  }

  return tokens;
}

function isModuleDeclarationSource(tokens, fromIndex) {
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.value === ";") return false;
    if (token.value === "=" || token.value === ":") return false;
    if (token.kind === "word" && ["import", "export"].includes(token.value)) {
      return true;
    }
  }
  return false;
}

function templateStaticPrefix(source, token) {
  let index = token.contentStart;
  while (index < token.contentEnd) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === "$" && source[index + 1] === "{") {
      return {
        end: index,
        value: source.slice(token.contentStart, index),
      };
    }
    index += 1;
  }
  return {
    end: token.contentEnd,
    value: source.slice(token.contentStart, token.contentEnd),
  };
}

function splitSpecifier(specifier) {
  const suffixStart = specifier.search(/[?#]/);
  if (suffixStart === -1) {
    return { path: specifier, suffix: "" };
  }
  return {
    path: specifier.slice(0, suffixStart),
    suffix: specifier.slice(suffixStart),
  };
}

function canonicalSpecifier(filePath, specifier) {
  if (!relativeSpecifierPattern.test(specifier)) return null;

  const { path: pathPart, suffix } = splitSpecifier(specifier);
  const target = resolve(dirname(filePath), pathPart || ".");
  const sourceRelative = relative(sourceRoot, target).split(sep).join("/");
  if (sourceRelative === ".." || sourceRelative.startsWith("../")) {
    throw new Error(
      `relative import escapes src/: ${relative(root, filePath)} -> ${specifier}`,
    );
  }

  let canonical = sourceRelative ? `@/${sourceRelative}` : "@";
  if (pathPart.endsWith("/")) canonical += "/";
  return `${canonical}${suffix}`;
}

function moduleSpecifierTokens(tokens) {
  const candidates = [];
  const seen = new Set();

  const add = (token) => {
    const key = `${token.contentStart}:${token.contentEnd}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(token);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "word") continue;

    if (token.value === "import") {
      const next = tokens[index + 1];
      const afterParenthesis = tokens[index + 2];
      if (next?.kind === "literal" || next?.kind === "template") {
        add(next);
      } else if (
        next?.value === "(" &&
        (afterParenthesis?.kind === "literal" ||
          afterParenthesis?.kind === "template")
      ) {
        add(afterParenthesis);
      }
    }

    if (token.value === "from") {
      const next = tokens[index + 1];
      if (
        (next?.kind === "literal" || next?.kind === "template") &&
        isModuleDeclarationSource(tokens, index)
      ) {
        add(next);
      }
    }
  }

  return candidates;
}

function createEdits(filePath, source) {
  const edits = [];
  for (const token of moduleSpecifierTokens(tokenize(source))) {
    if (token.kind === "literal") {
      const specifier = source.slice(token.contentStart, token.contentEnd);
      const canonical = canonicalSpecifier(filePath, specifier);
      if (canonical !== null && canonical !== specifier) {
        edits.push({
          start: token.contentStart,
          end: token.contentEnd,
          replacement: canonical,
        });
      }
      continue;
    }

    const prefix = templateStaticPrefix(source, token);
    const canonical = canonicalSpecifier(filePath, prefix.value);
    if (canonical !== null && canonical !== prefix.value) {
      edits.push({
        start: token.contentStart,
        end: prefix.end,
        replacement: canonical,
      });
    }
  }
  return edits;
}

const changedFiles = [];
const errors = [];
let changedSpecifiers = 0;

for (const filePath of collectSourceFiles(sourceRoot)) {
  const source = readFileSync(filePath, "utf8");
  let edits;
  try {
    edits = createEdits(filePath, source);
  } catch (error) {
    errors.push(`${relative(root, filePath)}: ${error.message}`);
    continue;
  }
  if (edits.length === 0) continue;

  changedFiles.push(relative(root, filePath));
  changedSpecifiers += edits.length;
  if (!write) continue;

  let updated = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    updated = `${updated.slice(0, edit.start)}${edit.replacement}${updated.slice(edit.end)}`;
  }
  writeFileSync(filePath, updated);
}

if (errors.length > 0) {
  console.error("Cannot safely canonicalize these imports:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (changedFiles.length === 0) {
  console.log("Relative internal imports are already canonical.");
} else if (write) {
  console.log(
    `Canonicalized ${changedSpecifiers} import specifiers in ${changedFiles.length} files.`,
  );
} else if (check) {
  console.error(
    `Found ${changedSpecifiers} relative import specifiers in ${changedFiles.length} files. Run npm run fix:import-alias.`,
  );
  process.exitCode = 1;
}
