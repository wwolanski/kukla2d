import type { ExportEncoder } from "./exportApplicationTypes.types.js";

/** @param {string} variantId */
export function resolveExportEncoder(
  variantId: string,
  encoders: Readonly<Record<string, ExportEncoder>>,
): ExportEncoder {
  const encoder = encoders[variantId];
  if (!encoder)
    throw new Error(`No encoder registered for variant: ${variantId}`);
  return encoder;
}
