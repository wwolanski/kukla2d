import { migrate_0_1_to_1 } from './migrations/0_1-to-1.js';
import { migrate_1_to_2 } from './migrations/1-to-2.js';
import { migrate_2_to_3 } from './migrations/2-to-3.js';
import { migrate_3_to_4 } from './migrations/3-to-4.js';
import { migrate_4_to_5 } from './migrations/4-to-5.js';
import { migrate_5_to_6 } from './migrations/5-to-6.js';
import { migrate_6_to_7 } from './migrations/6-to-7.js';
import { migrate_7_to_8 } from './migrations/7-to-8.js';
import { migrate_8_to_9 } from './migrations/8-to-9.js';
import { migrate_9_to_10 } from './migrations/9-to-10.js';
import {
  isMigrationRecord,
  readRawVersion,
  type MigrationDocument,
  type MigrationFromKey,
  type MigrationRegistry,
} from './migrations/types.js';
import { CURRENT_PROJECT_VERSION } from './projectSchema.js';

const MIGRATIONS: MigrationRegistry = {
  '0.1': migrate_0_1_to_1,
  '1': migrate_1_to_2,
  '2': migrate_2_to_3,
  '3': migrate_3_to_4,
  '4': migrate_4_to_5,
  '5': migrate_5_to_6,
  '6': migrate_6_to_7,
  '7': migrate_7_to_8,
  '8': migrate_8_to_9,
  '9': migrate_9_to_10,
};

function missingMigrationError(version: unknown): Error {
  return new Error(
    `No migration found from version "${formatVersion(version)}" to next version. ` +
    `Current target: ${String(CURRENT_PROJECT_VERSION)}`,
  );
}

function formatVersion(version: unknown): string {
  if (typeof version === 'number' || typeof version === 'string') return String(version);
  if (version === undefined) return 'undefined';
  if (version === null) return 'null';
  return '[object]';
}

export function migrateProject(project: unknown): MigrationDocument {
  if (!isMigrationRecord(project)) {
    throw missingMigrationError(readRawVersion(project));
  }

  let current: MigrationDocument = project;
  let version: number | string = current.version;

  while (String(version) !== String(CURRENT_PROJECT_VERSION)) {
    const key = String(version) as MigrationFromKey;
    const migration = MIGRATIONS[key];
    if (!migration) {
      throw missingMigrationError(version);
    }
    current = migration(current);
    version = current.version;
  }

  return current;
}
