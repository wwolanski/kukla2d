import type { PackedPage } from "./domain/phaserAtlasPacker.types.js";
import type {
  AtlasJsonRegion,
  MultiAtlasJson,
  MultiAtlasPageEntry,
  SingleAtlasJson,
} from "./phaserAtlasJson.types.js";

export function buildSingleAtlasJson(
  page: PackedPage,
  pageFileName: string,
  scale: string,
): SingleAtlasJson {
  const frames: Record<string, AtlasJsonRegion> = {};
  for (const r of page.regions) {
    frames[r.name] = {
      name: r.name,
      frame: { ...r.frame },
      rotated: false,
      trimmed: r.trimmed,
      spriteSourceSize: { ...r.spriteSourceSize },
      sourceSize: { ...r.sourceSize },
    };
  }
  return {
    frames,
    meta: {
      app: "Kukla2D",
      version: "1",
      image: pageFileName,
      format: "RGBA8888",
      scale,
    },
  };
}

export function buildMultiAtlasJson(
  pages: readonly PackedPage[],
  pageFileNames: readonly string[],
  scale: string,
): MultiAtlasJson {
  const textures: MultiAtlasPageEntry[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const frames = page.regions.map((r) => ({
      filename: r.name,
      name: r.name,
      frame: { ...r.frame },
      rotated: false as const,
      trimmed: r.trimmed,
      spriteSourceSize: { ...r.spriteSourceSize },
      sourceSize: { ...r.sourceSize },
    }));
    textures.push({ image: pageFileNames[i]!, frames });
  }
  return {
    textures,
    meta: {
      app: "Kukla2D",
      version: "1",
      format: "RGBA8888",
      scale,
    },
  };
}
