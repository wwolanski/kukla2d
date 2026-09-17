export const APP_DB_NAME = 'kukla2d-db';
export const APP_DB_VERSION = 3;
export const PROJECT_STORE = 'projects';
export const RECOVERY_STORE = 'workspace-recovery';
export const SCHEMA_STORE = 'modular-sprite-schemas';
export const SCHEMA_ASSET_STORE = 'modular-sprite-schema-assets';
export const SEMANTIC_STORE = 'semantic-definitions';
export const SCHEMA_SYNC_STORE = 'schema-catalog-sync-state';

export function openAppDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) db.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SCHEMA_STORE)) {
        const schemas = db.createObjectStore(SCHEMA_STORE, { keyPath: ['schemaId', 'revision'] });
        schemas.createIndex('compositionId', 'compositionId');
        schemas.createIndex('origin.kind', 'origin.kind');
        schemas.createIndex('characterTypeIds', 'characterTypeIds', { multiEntry: true });
        schemas.createIndex('characterClassIds', 'characterClassIds', { multiEntry: true });
        schemas.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(SCHEMA_ASSET_STORE)) db.createObjectStore(SCHEMA_ASSET_STORE, { keyPath: 'assetId' });
      if (!db.objectStoreNames.contains(SEMANTIC_STORE)) db.createObjectStore(SEMANTIC_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SCHEMA_SYNC_STORE)) db.createObjectStore(SCHEMA_SYNC_STORE, { keyPath: 'sourceId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open application database'));
  });
}

export function requestResult<T>(request: IDBRequest<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error(message)); });
}
