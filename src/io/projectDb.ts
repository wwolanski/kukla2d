import { openAppDb, PROJECT_STORE, RECOVERY_STORE } from '@/io/appDb';
import {
  PROJECT_ARCHIVE_FORMAT_ID,
  PROJECT_ARCHIVE_VERSION,
  PROJECT_FILE_EXTENSION,
} from '@/io/projectFormat';

import { isRecord } from '@/lib/guards';

const STORE_NAME = PROJECT_STORE;

export interface StoredProjectRecord {
  id: string;
  name: string;
  blob: Blob;
  thumbnail: string;
  updatedAt: number;
  formatId: string;
  formatVersion: number;
  extension: string;
  author?: string;
}

export interface ProjectRecordMetadata {
  formatId?: string;
  formatVersion?: number;
  extension?: string;
  author?: string;
}

export interface RecoveryRecord {
  id: 'workspace-recovery';
  archive: Blob;
  savedAt: number;
  sourceProjectId: string | null;
  sourceProjectName: string | null;
  documentVersion: number | string;
  revision: number;
}

export function isStoredProjectRecord(value: unknown): value is StoredProjectRecord {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.name !== 'string') return false;
  if (!(value.blob instanceof Blob)) return false;
  if (typeof value.thumbnail !== 'string') return false;
  if (!Number.isFinite(value.updatedAt)) return false;
  if (typeof value.formatId !== 'string' || value.formatId.length === 0) return false;
  if (!Number.isFinite(value.formatVersion)) return false;
  if (typeof value.extension !== 'string' || value.extension.length === 0) return false;
  if (value.author !== undefined && typeof value.author !== 'string') return false;
  return true;
}

export function isValidRecoveryRecord(value: unknown): value is RecoveryRecord {
  if (!isRecord(value)) return false;
  if (value.id !== 'workspace-recovery') return false;
  if (!(value.archive instanceof Blob)) return false;
  if (!Number.isFinite(value.savedAt) || (value.savedAt as number) <= 0) return false;
  if (value.sourceProjectId !== null && typeof value.sourceProjectId !== 'string') return false;
  if (value.sourceProjectName !== null && typeof value.sourceProjectName !== 'string') return false;
  const validDocumentVersion =
    typeof value.documentVersion === 'string' || Number.isFinite(value.documentVersion);
  if (!validDocumentVersion) return false;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return false;
  return true;
}

function openDb(): Promise<IDBDatabase> {
  return openAppDb();
}

export async function listProjects(): Promise<StoredProjectRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const raw: unknown = request.result;
      if (!Array.isArray(raw)) {
        return reject(new Error('IndexedDB returned non-array result for listProjects'));
      }
      const projects: StoredProjectRecord[] = [];
      for (const entry of raw) {
        if (isStoredProjectRecord(entry)) {
          projects.push(entry);
        } else {
          const id = isRecord(entry) && typeof entry.id === 'string' ? entry.id : '<unknown>';
          return reject(
            new Error(`Invalid project record in IndexedDB store "${STORE_NAME}" (id: ${id})`),
          );
        }
      }
      projects.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(projects);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to list projects'));
  });
}

export async function saveToDb(
  id: string | null,
  name: string,
  blob: Blob,
  thumbnail: string,
  metadata?: ProjectRecordMetadata,
): Promise<string> {
  const db = await openDb();
  const currentId = id || Math.random().toString(36).slice(2, 9);
  const updatedAt = Date.now();
  const normalizedMetadata = metadata ?? {};
  const {
    formatId = PROJECT_ARCHIVE_FORMAT_ID,
    formatVersion = PROJECT_ARCHIVE_VERSION,
    extension = PROJECT_FILE_EXTENSION,
    author = '',
  } = normalizedMetadata;

  const record: StoredProjectRecord = {
    id: currentId,
    name,
    blob,
    thumbnail,
    updatedAt,
    formatId,
    formatVersion,
    extension,
    author,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => resolve(currentId);
    request.onerror = () => reject(request.error ?? new Error('Failed to save project'));
  });
}

export async function loadFromDb(id: string): Promise<StoredProjectRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const raw: unknown = request.result;
      if (raw === undefined || raw === null) {
        return resolve(null);
      }
      if (!isStoredProjectRecord(raw)) {
        return reject(
          new Error(`Invalid project record in IndexedDB store "${STORE_NAME}" (id: ${id})`),
        );
      }
      resolve(raw);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to load project'));
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete project'));
  });
}

export async function updateProjectName(id: string, newName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const raw: unknown = getRequest.result;
      if (!isStoredProjectRecord(raw)) {
        return reject(new Error('Project not found'));
      }
      raw.name = newName;
      raw.updatedAt = Date.now();
      const putRequest = store.put(raw);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () =>
        reject(putRequest.error ?? new Error('Failed to update project name'));
    };
    getRequest.onerror = () =>
      reject(getRequest.error ?? new Error('Failed to read project for rename'));
  });
}

export async function updateProjectAuthor(id: string, newAuthor: string): Promise<void> {
  const record = await loadFromDb(id);
  if (!record) throw new Error('Project not found');

  const { loadProject, saveProject } = await import('@/io/projectFile');
  const loaded = await loadProject(record.blob);
  let blob: Blob;
  try {
    loaded.project.author = newAuthor;
    blob = await saveProject(loaded.project);
  } finally {
    loaded.resources.dispose();
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      ...record,
      author: newAuthor,
      blob,
      updatedAt: Date.now(),
    } satisfies StoredProjectRecord);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to update project author'));
  });
}

export async function duplicateProject(id: string): Promise<string> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const raw: unknown = getRequest.result;
      if (!isStoredProjectRecord(raw)) {
        return reject(new Error('Project not found'));
      }
      const newRecord: StoredProjectRecord = {
        id: Math.random().toString(36).slice(2, 9),
        name: `${raw.name} (Copy)`,
        blob: raw.blob,
        thumbnail: raw.thumbnail,
        updatedAt: Date.now(),
        formatId: raw.formatId ?? PROJECT_ARCHIVE_FORMAT_ID,
        formatVersion: raw.formatVersion ?? PROJECT_ARCHIVE_VERSION,
        extension: raw.extension ?? PROJECT_FILE_EXTENSION,
        author: raw.author ?? '',
      };
      const putRequest = store.put(newRecord);
      putRequest.onsuccess = () => resolve(newRecord.id);
      putRequest.onerror = () =>
        reject(putRequest.error ?? new Error('Failed to duplicate project'));
    };
    getRequest.onerror = () =>
      reject(getRequest.error ?? new Error('Failed to read project for duplicate'));
  });
}

export async function readRecovery(): Promise<RecoveryRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, 'readonly');
    const store = transaction.objectStore(RECOVERY_STORE);
    const request = store.get('workspace-recovery');

    request.onsuccess = () => {
      const raw: unknown = request.result;
      if (raw === undefined || raw === null) {
        return resolve(null);
      }
      if (isValidRecoveryRecord(raw)) {
        resolve(raw);
      } else {
        clearRecovery().then(() => resolve(null), reject);
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read recovery record'));
  });
}

export async function writeRecovery(record: RecoveryRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, 'readwrite');
    const store = transaction.objectStore(RECOVERY_STORE);
    store.put(record);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Recovery transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Recovery transaction aborted'));
  });
}

export async function clearRecovery(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, 'readwrite');
    const store = transaction.objectStore(RECOVERY_STORE);
    store.delete('workspace-recovery');

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Recovery clear transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Recovery clear transaction aborted'));
  });
}
