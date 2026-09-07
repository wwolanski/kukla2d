type RenameValidationResult =
  | { valid: true; value: string }
  | { valid: false; reason: "not_string" | "empty" };

export function validateRename(value: unknown): RenameValidationResult {
  if (typeof value !== "string") return { valid: false, reason: "not_string" };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, reason: "empty" };
  return { valid: true, value: trimmed };
}

export function validateRenameValue(value: unknown): string | null {
  const result = validateRename(value);
  return result.valid ? result.value : null;
}

export function resolveDisplayName(
  localName: string | null | undefined,
  sourceFileName: string | null | undefined,
): string {
  if (localName && localName.trim().length > 0) return localName;
  return sourceFileName || "";
}

export function isSourceNameReadonly(
  localName: string | null | undefined,
  sourceFileName: string | null | undefined,
): boolean {
  return (
    sourceFileName != null &&
    sourceFileName.length > 0 &&
    localName !== sourceFileName
  );
}
