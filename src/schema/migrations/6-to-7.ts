import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 6 as const;
export const TO_VERSION = 7 as const;

export function migrate_6_to_7(project: MigrationDocument): MigrationDocument {
  const controlHandles = Array.isArray(project.controlHandles)
    ? project.controlHandles
    : [];
  const animationModifiers = Array.isArray(project.animationModifiers)
    ? project.animationModifiers
    : [];
  return {
    ...project,
    version: 7,
    controlHandles,
    animationModifiers,
  };
}
