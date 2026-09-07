import { resolveExportEncoder as resolveExportEncoderFromRegistry } from "../application/resolveExportEncoder.js";
import { browserExportSink as browserExportSinkAdapter } from "../infrastructure/browserExportSink.js";
import { encodeGif as encodeGifAdapter } from "../infrastructure/encodeGif.js";
import {
  buildPngFilePath as buildPngFilePathAdapter,
  dataUrlToBlob as dataUrlToBlobAdapter,
  encodePngSequence as encodePngSequenceAdapter,
} from "../infrastructure/encodePngSequence.js";
import { encodePngSpritesheet as encodePngSpritesheetAdapter } from "../infrastructure/encodePngSpritesheet.js";

import type { ExportEncoder } from "../application/exportApplicationTypes.types.js";

const ENCODERS = {
  gif: encodeGifAdapter,
  png_sequence: encodePngSequenceAdapter,
  png_spritesheet: encodePngSpritesheetAdapter,
};

export function resolveExportEncoder(variantId: string): ExportEncoder {
  return resolveExportEncoderFromRegistry(variantId, ENCODERS);
}

export function browserExportSink(
  ...args: Parameters<typeof browserExportSinkAdapter>
): ReturnType<typeof browserExportSinkAdapter> {
  return browserExportSinkAdapter(...args);
}

export function encodeGif(
  ...args: Parameters<typeof encodeGifAdapter>
): ReturnType<typeof encodeGifAdapter> {
  return encodeGifAdapter(...args);
}

export function encodePngSequence(
  ...args: Parameters<typeof encodePngSequenceAdapter>
): ReturnType<typeof encodePngSequenceAdapter> {
  return encodePngSequenceAdapter(...args);
}

export function encodePngSpritesheet(
  ...args: Parameters<typeof encodePngSpritesheetAdapter>
): ReturnType<typeof encodePngSpritesheetAdapter> {
  return encodePngSpritesheetAdapter(...args);
}

export function dataUrlToBlob(
  ...args: Parameters<typeof dataUrlToBlobAdapter>
): ReturnType<typeof dataUrlToBlobAdapter> {
  return dataUrlToBlobAdapter(...args);
}

export function buildPngFilePath(
  ...args: Parameters<typeof buildPngFilePathAdapter>
): ReturnType<typeof buildPngFilePathAdapter> {
  return buildPngFilePathAdapter(...args);
}
