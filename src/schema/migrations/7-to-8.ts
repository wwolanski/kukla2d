import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 7 as const;
export const TO_VERSION = 8 as const;

export function migrate_7_to_8(project: MigrationDocument): MigrationDocument {
  return {
    ...project,
    version: 8,
  };
}
