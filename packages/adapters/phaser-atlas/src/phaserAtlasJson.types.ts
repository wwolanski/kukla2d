export interface AtlasJsonRegion {
  name: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface SingleAtlasJson {
  frames: Record<string, AtlasJsonRegion>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    scale: string;
  };
}

export interface MultiAtlasPageEntry {
  image: string;
  frames: Array<{ filename: string } & AtlasJsonRegion>;
}

export interface MultiAtlasJson {
  textures: MultiAtlasPageEntry[];
  meta: { app: string; version: string; format: string; scale: string };
}
