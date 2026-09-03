import type { MigrationDocument } from './types.js';

export const FROM_VERSION = 9 as const;
export const TO_VERSION = 10 as const;

export function migrate_9_to_10(project: MigrationDocument): MigrationDocument {
  return {
    ...project,
    version: 10,
    modularSprites: Array.isArray(project.modularSprites) ? project.modularSprites : [],
  };
}
