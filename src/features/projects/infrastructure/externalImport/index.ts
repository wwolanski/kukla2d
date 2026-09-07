import { saveProject } from "@/io/projectFile";

import { scmlImporter } from "./scml/scmlImporter.js";

import type { ExternalProjectImporter } from "./externalImport.types.js";

const IMPORTERS: readonly ExternalProjectImporter[] = [scmlImporter];

interface ExternalImportFormat {
  id: string;
  label: string;
}

export const externalImportFormats: readonly ExternalImportFormat[] =
  IMPORTERS.map(({ id, label }) => ({ id, label }));

export async function importExternalProject(
  filesInput: FileList | readonly File[],
): Promise<File> {
  const files = Array.from(filesInput);
  const importer = IMPORTERS.find((candidate) => candidate.canImport(files));
  if (!importer)
    throw new Error(
      "Unsupported external project. Select one .scml file and its image folder.",
    );
  const imported = await importer.import(files);
  try {
    const archive = await saveProject(imported.project);
    const scmlFile = files.find((file) =>
      file.name.toLowerCase().endsWith(".scml"),
    );
    const baseName = (scmlFile?.name ?? "Imported project").replace(
      /\.scml$/i,
      "",
    );
    return new File([archive], `${baseName}.kk2d`, { type: "application/zip" });
  } finally {
    imported.dispose();
  }
}
