import { convertScmlToProject } from "./convertScml.js";
import { parseScml } from "./parseScml.js";

import type { ExternalProjectImporter } from "../externalImport.types.js";

function normalizedPath(file: File): string {
  const relative =
    typeof file.webkitRelativePath === "string" && file.webkitRelativePath
      ? file.webkitRelativePath
      : file.name;
  return relative.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function findImage(files: readonly File[], declaredName: string): File | null {
  const target = declaredName
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
  const candidates = files.filter((file) => {
    const path = normalizedPath(file);
    return path === target || path.endsWith(`/${target}`);
  });
  if (candidates.length === 0) return null;
  return (
    candidates.sort(
      (a, b) => normalizedPath(a).length - normalizedPath(b).length,
    )[0] ?? null
  );
}

export const scmlImporter: ExternalProjectImporter = {
  id: "brashmonkey-spriter-scml",
  label: "BrashMonkey Spriter (.scml)",
  canImport(files) {
    return (
      files.filter((file) => file.name.toLowerCase().endsWith(".scml"))
        .length === 1
    );
  },
  async import(files) {
    const scmlFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith(".scml"),
    );
    if (scmlFiles.length !== 1)
      throw new Error("Select one .scml file and all image files used by it");
    const scmlFile = scmlFiles[0]!;
    const document = parseScml(await scmlFile.text());
    const urls: string[] = [];
    try {
      const sources = new Map<string, { url: string; size: number }>();
      for (const asset of document.files) {
        const image = findImage(files, asset.name);
        if (!image) throw new Error(`Missing SCML image: ${asset.name}`);
        const url = URL.createObjectURL(image);
        urls.push(url);
        sources.set(asset.key, { url, size: image.size });
      }
      const project = convertScmlToProject(document, {
        sources,
        sourceFileName: scmlFile.name,
      });
      return {
        project,
        dispose() {
          for (const url of urls) URL.revokeObjectURL(url);
        },
      };
    } catch (error) {
      for (const url of urls) URL.revokeObjectURL(url);
      throw error;
    }
  },
};
