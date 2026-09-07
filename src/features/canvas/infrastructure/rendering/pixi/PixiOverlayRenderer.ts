import { Graphics, type Container } from "pixi.js";

import type { CanvasOverlayFrame } from "@/features/canvas/domain/canvasOverlayFrame.types.js";
import type { GizmoFrame } from "@/features/canvas/domain/gizmoFrame.types.js";
import type { buildSkeletonFrame } from "@/features/canvas/domain/skeletonFrame.js";
import type { WarpLatticeFrame } from "@/features/canvas/domain/warpLatticeFrame.types.js";

import {
  drawIkConstraints,
  drawMeshWireframe,
  drawWarpLattice,
  drawWeightPaint,
} from "./PixiMeshOverlayDrawers.js";
import { drawSkeleton } from "./PixiRigOverlayDrawers.js";

type SkeletonFrame = NonNullable<ReturnType<typeof buildSkeletonFrame>>;
type MeshWireframe = CanvasOverlayFrame["meshWireframe"];
type IkOverlay = CanvasOverlayFrame["ikOverlay"];
type WeightPaintOverlay = CanvasOverlayFrame["weightPaintOverlay"];
type WeightPaintPoints = CanvasOverlayFrame["weightPaintPoints"];
type MarqueeWorldBox = CanvasOverlayFrame["marqueeWorldBox"];
type DrawBonePreview = CanvasOverlayFrame["drawBonePreview"];
type ExportAreaFrame = CanvasOverlayFrame["exportAreaFrame"];
type BrushCursor = CanvasOverlayFrame["brushCursor"];
interface HoverOptions {
  tone?: "amber" | "default";
}
interface DashedLineOptions {
  graphics: Graphics;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dashLength: number;
  gapLength: number;
}

function drawDashedLine({
  graphics,
  startX,
  startY,
  endX,
  endY,
  dashLength,
  gapLength,
}: DashedLineOptions): void {
  const length = Math.hypot(endX - startX, endY - startY);
  if (length <= 0) return;
  const unitX = (endX - startX) / length;
  const unitY = (endY - startY) / length;
  for (
    let distance = 0;
    distance < length;
    distance += dashLength + gapLength
  ) {
    const dashEnd = Math.min(distance + dashLength, length);
    graphics.moveTo(startX + unitX * distance, startY + unitY * distance);
    graphics.lineTo(startX + unitX * dashEnd, startY + unitY * dashEnd);
  }
}

export class PixiOverlayRenderer {
  readonly overlayLayer: Container;
  private readonly _gizmoGraphics: Graphics;
  private readonly _skeletonGraphics: Graphics;
  private readonly _warpGraphics: Graphics;
  private readonly _meshGraphics: Graphics;
  private readonly _ikGraphics: Graphics;
  private readonly _weightGraphics: Graphics;
  private readonly _hoverGraphics: Graphics;
  private readonly _marqueeGraphics: Graphics;
  private readonly _drawBoneGraphics: Graphics;
  private readonly _brushGraphics: Graphics;
  private readonly _exportAreaGraphics: Graphics;

  constructor({ overlayLayer }: { overlayLayer: Container }) {
    this.overlayLayer = overlayLayer;
    this._gizmoGraphics = new Graphics();
    this._skeletonGraphics = new Graphics();
    this._warpGraphics = new Graphics();
    this._meshGraphics = new Graphics();
    this._ikGraphics = new Graphics();
    this._weightGraphics = new Graphics();
    this._hoverGraphics = new Graphics();
    this._marqueeGraphics = new Graphics();
    this._drawBoneGraphics = new Graphics();
    this._brushGraphics = new Graphics();
    this._exportAreaGraphics = new Graphics();
    const layers = [
      this._gizmoGraphics,
      this._skeletonGraphics,
      this._warpGraphics,
      this._meshGraphics,
      this._ikGraphics,
      this._weightGraphics,
      this._hoverGraphics,
      this._marqueeGraphics,
      this._drawBoneGraphics,
      this._brushGraphics,
      this._exportAreaGraphics,
    ];
    for (const l of layers) overlayLayer.addChild(l);
  }
  clear(): void {
    this._gizmoGraphics.clear();
    this._skeletonGraphics.clear();
    this._warpGraphics.clear();
    this._meshGraphics.clear();
    this._ikGraphics.clear();
    this._weightGraphics.clear();
    this._hoverGraphics.clear();
    this._marqueeGraphics.clear();
    this._drawBoneGraphics.clear();
    this._brushGraphics.clear();
    this._exportAreaGraphics.clear();
  }
  renderGizmo(gizmoFrame: GizmoFrame | null, zoom: number): void {
    const g = this._gizmoGraphics;
    g.clear();
    if (!gizmoFrame?.visible) return;
    const invZoom = zoom > 0 ? 1 / zoom : 1;
    const pts = gizmoFrame.bboxPoints;
    if (pts.length >= 4) {
      const [first, second, third, fourth] = pts;
      if (!first || !second || !third || !fourth) return;
      g.moveTo(first.x, first.y);
      g.lineTo(second.x, second.y);
      g.lineTo(third.x, third.y);
      g.lineTo(fourth.x, fourth.y);
      g.closePath();
      g.stroke({ width: 2 * invZoom, color: 0x22d3ee, alpha: 0.9 });
    }
    const pivotR = 6 * invZoom;
    g.circle(gizmoFrame.pivot.x, gizmoFrame.pivot.y, pivotR)
      .fill({ color: 0xec4899, alpha: 0.95 })
      .stroke({ width: 1.5 * invZoom, color: 0xffffff, alpha: 0.9 });
    for (const point of pts) {
      const size = 8 * invZoom;
      const half = size / 2;
      g.moveTo(point.x - half, point.y - half);
      g.lineTo(point.x + half, point.y - half);
      g.lineTo(point.x + half, point.y + half);
      g.lineTo(point.x - half, point.y + half);
      g.closePath();
      g.fill({ color: 0xffffff, alpha: 1 });
      g.stroke({ width: 1.5 * invZoom, color: 0x0891b2, alpha: 1 });
    }
    const rotR = 6 * invZoom;
    g.circle(
      gizmoFrame.rotationHandle.x,
      gizmoFrame.rotationHandle.y,
      rotR,
    ).fill({ color: 0xfacc15, alpha: 0.9 });
    g.moveTo(gizmoFrame.topCenter.x, gizmoFrame.topCenter.y);
    g.lineTo(gizmoFrame.rotationHandle.x, gizmoFrame.rotationHandle.y);
    g.stroke({ width: 1.5 * invZoom, color: 0xfacc15, alpha: 0.6 });
  }
  renderSkeleton(skeletonFrame: SkeletonFrame | null, zoom: number): void {
    drawSkeleton(this._skeletonGraphics, skeletonFrame, zoom);
  }
  renderWarpLattice(warpFrame: WarpLatticeFrame | null, zoom: number): void {
    drawWarpLattice(this._warpGraphics, warpFrame, zoom);
  }
  renderMeshWireframe(frame: MeshWireframe, zoom: number): void {
    drawMeshWireframe(this._meshGraphics, frame, zoom);
  }
  renderIkConstraints(frame: IkOverlay | null, zoom: number): void {
    drawIkConstraints(this._ikGraphics, frame, zoom);
  }
  renderWeightPaint(
    frame: WeightPaintOverlay | WeightPaintPoints,
    zoom: number,
  ): void {
    drawWeightPaint(this._weightGraphics, frame, zoom);
  }
  renderHover(
    hoverHit: GizmoFrame | null,
    zoom: number,
    options: HoverOptions = {},
  ): void {
    const g = this._hoverGraphics;
    g.clear();
    if (!hoverHit) return;
    const invZoom = zoom > 0 ? 1 / zoom : 1;
    const amber = options.tone === "amber";
    const color = amber ? 0xfacc15 : 0x38bdf8;
    const contours = hoverHit.outlineContours?.length
      ? hoverHit.outlineContours
      : [hoverHit.bboxPoints];
    if (contours.some((points) => points?.length >= 3)) {
      for (const pts of contours) {
        if (pts?.length < 3) continue;
        const first = pts[0];
        if (!first) continue;
        g.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i++) {
          const point = pts[i];
          if (point) g.lineTo(point.x, point.y);
        }
        g.closePath();
      }
      if (amber) g.stroke({ width: 6 * invZoom, color: 0xf59e0b, alpha: 0.24 });
      g.stroke({ width: 1.75 * invZoom, color, alpha: amber ? 0.95 : 0.75 });
      return;
    }
  }
  renderMarquee(marqueeWorldBox: MarqueeWorldBox, zoom: number): void {
    const g = this._marqueeGraphics;
    g.clear();
    if (!marqueeWorldBox) return;
    const invZoom = zoom > 0 ? 1 / zoom : 1;
    const { x, y, w, h } = marqueeWorldBox;
    g.rect(x, y, w, h);
    g.fill({ color: 0x22d3ee, alpha: 0.12 });
    g.rect(x, y, w, h);
    g.stroke({ width: invZoom, color: 0x22d3ee, alpha: 0.9 });
  }
  renderDrawBonePreview(drawBonePreview: DrawBonePreview, zoom: number): void {
    const g = this._drawBoneGraphics;
    g.clear();
    if (!drawBonePreview) return;
    const invZoom = zoom > 0 ? 1 / zoom : 1;
    const { startX, startY, endX, endY } = drawBonePreview;
    g.moveTo(startX, startY);
    g.lineTo(endX, endY);
    g.stroke({ width: 5 * invZoom, color: 0x0f172a, alpha: 0.9 });
    g.moveTo(startX, startY);
    g.lineTo(endX, endY);
    g.stroke({ width: 2 * invZoom, color: 0x22d3ee, alpha: 0.95 });
    const startR = 3.5 * invZoom;
    g.circle(startX, startY, startR)
      .fill({ color: 0xfacc15, alpha: 1 })
      .stroke({ width: invZoom, color: 0x000000, alpha: 1 });
    const endR = 4 * invZoom;
    g.circle(endX, endY, endR)
      .fill({ color: 0x22d3ee, alpha: 1 })
      .stroke({ width: invZoom, color: 0x000000, alpha: 1 });
  }
  renderExportArea(exportAreaFrame: ExportAreaFrame, zoom: number): void {
    const g = this._exportAreaGraphics;
    g.clear();
    if (!exportAreaFrame?.valid) return;
    const invZoom = zoom > 0 ? 1 / zoom : 1;
    const { x, y, width, height } = exportAreaFrame;
    const dash = 8 * invZoom;
    const gap = 5 * invZoom;
    drawDashedLine({
      graphics: g,
      startX: x,
      startY: y,
      endX: x + width,
      endY: y,
      dashLength: dash,
      gapLength: gap,
    });
    drawDashedLine({
      graphics: g,
      startX: x + width,
      startY: y,
      endX: x + width,
      endY: y + height,
      dashLength: dash,
      gapLength: gap,
    });
    drawDashedLine({
      graphics: g,
      startX: x + width,
      startY: y + height,
      endX: x,
      endY: y + height,
      dashLength: dash,
      gapLength: gap,
    });
    drawDashedLine({
      graphics: g,
      startX: x,
      startY: y + height,
      endX: x,
      endY: y,
      dashLength: dash,
      gapLength: gap,
    });
    g.stroke({
      width: Math.max(1, 1.5 * invZoom),
      color: 0x22d3ee,
      alpha: 0.85,
    });
  }
  renderBrush(
    brushCursor: BrushCursor,
    brushWorldX: number | null,
    brushWorldY: number | null,
    zoom: number,
  ): void {
    const g = this._brushGraphics;
    g.clear();
    if (!brushCursor || brushWorldX == null || brushWorldY == null) return;
    const invZoom = zoom > 0 ? 1 / zoom : 1;
    const radius = brushCursor.brushSize * invZoom;
    g.circle(brushWorldX, brushWorldY, radius);
    g.stroke({ width: invZoom, color: 0xffffff, alpha: 0.8 });
  }
  dispose(): void {
    this.clear();
    const graphics = [
      this._gizmoGraphics,
      this._skeletonGraphics,
      this._warpGraphics,
      this._meshGraphics,
      this._ikGraphics,
      this._weightGraphics,
      this._hoverGraphics,
      this._marqueeGraphics,
      this._drawBoneGraphics,
      this._brushGraphics,
      this._exportAreaGraphics,
    ];
    for (const g of graphics) {
      if (g.parent) g.parent.removeChild(g);
      g.destroy();
    }
  }
}
