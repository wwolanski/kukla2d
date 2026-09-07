import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 5 as const;
export const TO_VERSION = 6 as const;

export function migrate_5_to_6(project: MigrationDocument): MigrationDocument {
  const libraryFolders = Array.isArray(project.libraryFolders)
    ? project.libraryFolders
    : [];
  const assetPlacements = Array.isArray(project.assetPlacements)
    ? project.assetPlacements
    : [];
  return {
    ...project,
    version: 6,
    libraryFolders,
    assetPlacements,
  };
}
