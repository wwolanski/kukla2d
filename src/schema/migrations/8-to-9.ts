import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 8 as const;
export const TO_VERSION = 9 as const;

export function migrate_8_to_9(project: MigrationDocument): MigrationDocument {
  return {
    ...project,
    version: 9,
  };
}
