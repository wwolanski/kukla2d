import type { LibraryFolder } from "@kukla2d/contracts";

function normalizedFolderName(name: string): string {
  return name.trim().toLowerCase();
}

export function validateUniqueLibraryFolderName(
  folders: readonly Pick<LibraryFolder, "id" | "name">[],
  requestedName: string,
  excludedFolderId?: string,
): string {
  const name = requestedName.trim();
  if (!name) throw new Error("Library folder name cannot be empty");

  const normalizedName = normalizedFolderName(name);
  const duplicate = folders.find(
    (folder) =>
      folder.id !== excludedFolderId &&
      normalizedFolderName(folder.name) === normalizedName,
  );
  if (duplicate)
    throw new Error(`A library folder named "${duplicate.name}" already exists`);

  return name;
}
