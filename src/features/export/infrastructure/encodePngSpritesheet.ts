import type { EncoderInput, ExportArtifact } from '@kukla2d/contracts';

import { resolveSpritesheetLayout } from '@/features/export/domain/spritesheetLayout.js';

type OutputCanvas = OffscreenCanvas | HTMLCanvasElement;

interface SpritesheetArtifact extends ExportArtifact {
  metadata: {
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    frameCount: number;
  };
}

function sanitizeName(name: string): string {
  return (name || 'animation')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'animation';
}

function createOutputCanvas(width: number, height: number): OutputCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getOutputContext(canvas: OutputCanvas): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  if ('convertToBlob' in canvas) return canvas.getContext('2d');
  return canvas.getContext('2d');
}

async function canvasToPngBlob(canvas: OutputCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Spritesheet canvas returned no PNG')), 'image/png');
  });
}

export async function encodePngSpritesheet({
  frames, area, animationName, spriteSheet, onProgress, signal,
}: EncoderInput): Promise<SpritesheetArtifact[]> {
  if (!frames?.length) return [];

  const frameWidth = area.outputWidth;
  const frameHeight = area.outputHeight;
  const layout = resolveSpritesheetLayout(frames.length, spriteSheet?.columns);
  const canvas = createOutputCanvas(frameWidth * layout.columns, frameHeight * layout.rows);
  const context = getOutputContext(canvas);
  if (!context) throw new Error('2D canvas is not available for spritesheet export');
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < frames.length; index += 1) {
    if (signal?.aborted) return [];
    const frame = frames[index]!;
    if (frame.width !== frameWidth || frame.height !== frameHeight) {
      throw new Error(
        `Frame ${frame.frameIndex + 1} dimensions ${frame.width}x${frame.height} ` +
        `do not match plan ${frameWidth}x${frameHeight}`
      );
    }
    onProgress?.({ current: index + 1, total: frames.length, label: `Packing frame ${index + 1}...` });
    const response = await fetch(frame.dataUrl);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      context.drawImage(bitmap, column * frameWidth, row * frameHeight, frameWidth, frameHeight);
    } finally {
      bitmap.close?.();
    }
  }

  const fileName = `${sanitizeName(animationName)}.png`;
  const blob = await canvasToPngBlob(canvas);
  return [{
    fileName,
    mimeType: 'image/png',
    blob,
    relativePath: fileName,
    metadata: {
      frameWidth,
      frameHeight,
      columns: layout.columns,
      rows: layout.rows,
      frameCount: frames.length,
    },
  }];
}
