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

export interface RecoveryRecord {
  id: "workspace-recovery";
  archive: Blob;
  savedAt: number;
  sourceProjectId: string | null;
  sourceProjectName: string | null;
  documentVersion: number | string;
  revision: number;
}
