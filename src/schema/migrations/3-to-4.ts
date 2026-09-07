import { applyHistoricalClipToPartId } from "../../io/psdOrganizer.js";

import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 3 as const;
export const TO_VERSION = 4 as const;

type HistoricalClipNode = {
  id: string;
  name?: string | undefined;
  type?: string | undefined;
  clipToPartId?: string | undefined;
  [key: string]: unknown;
};

type MigrationNode = NonNullable<MigrationDocument["nodes"]>[number];

export function migrate_3_to_4(project: MigrationDocument): MigrationDocument {
  const migrated: MigrationDocument = {
    ...project,
    version: 4,
  };

  if (!Array.isArray(migrated.nodes)) {
    migrated.nodes = [];
    return migrated;
  }

  const cloned: HistoricalClipNode[] = migrated.nodes.map((node) => ({
    ...node,
  }));

  // The IO helper (src/io/psdOrganizer.js) is untyped JavaScript and outside
  // the migration scope (Stage 03 poza zakresem, C5). JSDoc declares its
  // `name` parameter required, while legacy migration records (K4) may omit
  // `name`; runtime helper falls back to '' via `??`. Bridge the boundary with
  // a minimal structural alias preserving `unknown` index.
  const helper = applyHistoricalClipToPartId as (
    nodes: HistoricalClipNode[],
  ) => MigrationNode[];
  const normalized: MigrationNode[] = helper(cloned);
  migrated.nodes = normalized;

  return migrated;
}
