export interface PackInput {
  identity: string;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  sourceWidth: number;
  sourceHeight: number;
  empty: boolean;
}

export interface PackedRegion {
  name: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pageIndex: number;
}

export interface PackedPage {
  width: number;
  height: number;
  regions: readonly PackedRegion[];
}

export interface PackResult {
  pages: readonly PackedPage[];
}

export interface PackError {
  code: string;
  frameKey: string;
  requiredSize: number;
  selectedSize: number;
  message: string;
}
