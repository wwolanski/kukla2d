import { useEffect, useRef } from 'react';

import type { ProcessedModularSprite } from '../../domain/contracts.js';

export function PartThumbnail({
  resultRef,
  resultVersion,
  regionIds,
  maxSize = 96,
}: {
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  regionIds: readonly number[];
  maxSize?: number;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const result = resultRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const selected = new Set(regionIds);
    const selectedRegions = result.regions.filter(region => selected.has(region.id));
    if (selectedRegions.length === 0) {
      canvas.width = 1;
      canvas.height = 1;
      return;
    }
    const minX = Math.min(...selectedRegions.map(region => region.bounds.x));
    const minY = Math.min(...selectedRegions.map(region => region.bounds.y));
    const maxX = Math.max(...selectedRegions.map(region => region.bounds.x + region.bounds.width - 1));
    const maxY = Math.max(...selectedRegions.map(region => region.bounds.y + region.bounds.height - 1));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const output = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourcePixel = (y + minY) * result.width + (x + minX);
        if (!selected.has(result.labels[sourcePixel] ?? 0)) continue;
        const sourceOffset = sourcePixel * 4;
        const outputOffset = (y * width + x) * 4;
        output[outputOffset] = result.rgba[sourceOffset] ?? 0;
        output[outputOffset + 1] = result.rgba[sourceOffset + 1] ?? 0;
        output[outputOffset + 2] = result.rgba[sourceOffset + 2] ?? 0;
        output[outputOffset + 3] = result.matte[sourcePixel] ?? 0;
      }
    }
    context.putImageData(new ImageData(output, width, height), 0, 0);
    const scale = Math.min(1, maxSize / Math.max(width, height));
    canvas.style.width = `${Math.round(width * scale)}px`;
    canvas.style.height = `${Math.round(height * scale)}px`;
  }, [maxSize, regionIds, resultRef, resultVersion]);

  return <canvas ref={canvasRef} aria-hidden className="shrink-0 rounded border bg-[linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] bg-[length:16px_16px]" />;
}

