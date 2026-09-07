import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 2 as const;
export const TO_VERSION = 3 as const;

interface MigrationSkinEntry {
  slotId: string;
  attachmentId: string;
  [key: string]: unknown;
}

interface MigrationSkin {
  id: string;
  name?: string | undefined;
  entries: MigrationSkinEntry[];
  [key: string]: unknown;
}

export function migrate_2_to_3(project: MigrationDocument): MigrationDocument {
  const migrated: MigrationDocument = { ...project };
  migrated.version = 3;

  if (!Array.isArray(migrated.skins)) migrated.skins = [];

  const slots = Array.isArray(migrated.slots) ? migrated.slots : [];
  if (migrated.skins.length === 0 && slots.length > 0) {
    const entries: MigrationSkinEntry[] = slots.map((slot) => ({
      slotId: slot.id,
      attachmentId: slot.setupAttachmentId ?? "",
    }));
    const skin: MigrationSkin = {
      id: "__default__",
      name: "default",
      entries,
    };
    migrated.skins.push(skin);
  }

  return migrated;
}
