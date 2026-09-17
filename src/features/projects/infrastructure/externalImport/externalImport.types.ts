import type { ProjectDocument } from "@kukla2d/contracts";

export interface ExternalProjectImporter {
  readonly id: string;
  readonly label: string;
  canImport(files: readonly File[]): boolean;
  import(files: readonly File[]): Promise<ImportedExternalProject>;
}

interface ImportedExternalProject {
  project: ProjectDocument;
  dispose(): void;
}
