export interface DecodedPng {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

interface CropSource {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageComposeSource {
  rgba: Uint8ClampedArray;
  srcWidth: number;
  crop: CropSource;
  dstX: number;
  dstY: number;
}
