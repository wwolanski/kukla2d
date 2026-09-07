/**
 * Shared types for the versioned migration chain (0.1 -> 10).
 *
 * Migration inputs are untrusted JSON-derived records. The migration layer
 * works on a legacy document shape that intentionally stays narrower than the
 * validated `ProjectDocument` (K3) boundary: migration data must never be cast
 * to K3, it remains a migration document until Zod is applied by the caller.
 *
 * Per-stage constraints (see `.plans/2-typescript-schema-foundation/stages/03-lancuch-migracji.md`):
 * - no `any`, no `as ProjectDocument`, no blanket suppressions;
 * - typed structural fields only for surfaces touched by a given step;
 * - index signature kept as `unknown` (never `any`) to force narrowing before use.
 *
 * Optional fields are explicitly typed `T | undefined` because tsconfig enables
 * `exactOptionalPropertyTypes`: passing `undefined` to a `?`-only field is
 * otherwise rejected, and historical records frequently omit these fields.
 */

import type { MigrationDocument } from "./migrationDocument.types.js";

/**
 * Guard R1: verify record and version first, then access fields. Inputs are
 * `unknown` JSON records until verified.
 */
export function isMigrationRecord(value: unknown): value is MigrationDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("version" in value)) {
    return false;
  }
  const version = value.version;
  return typeof version === "number" || typeof version === "string";
}

/**
 * Read a version-like value from any untrusted input, without throwing on
 * access. Used to preserve the historical error message shape when a record
 * or version is missing.
 */
export function readRawVersion(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  if ("version" in value) {
    return value.version;
  }
  return undefined;
}
