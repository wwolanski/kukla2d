import type { buildSkeletonFrame } from "@/features/canvas/domain/skeletonFrame.js";

import type { Graphics } from "pixi.js";

type SkeletonFrame = NonNullable<ReturnType<typeof buildSkeletonFrame>>;
type Point = { x: number; y: number };

function getBoneArrowPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  invZoom: number,
): Point[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < Number.EPSILON) {
    return [{ x: x1, y: y1 }];
  }

  const normalX = -dy / length;
  const normalY = dx / length;
  const baseHalfWidth = Math.min(length * 0.1, Math.max(1.75 * invZoom, 3.5));
  const bodyHalfWidth = Math.min(length * 0.18, Math.max(3 * invZoom, 7.5));

  const pointAt = (progress: number, halfWidth: number): Point => ({
    x: x1 + dx * progress + normalX * halfWidth,
    y: y1 + dy * progress + normalY * halfWidth,
  });

  return [
    { x: x1, y: y1 },
    pointAt(0.12, baseHalfWidth),
    pointAt(0.68, bodyHalfWidth),
    { x: x2, y: y2 },
    pointAt(0.68, -bodyHalfWidth),
    pointAt(0.12, -baseHalfWidth),
  ];
}

export function drawSkeleton(
  graphics: Graphics,
  frame: SkeletonFrame | null,
  zoom: number,
): void {
  graphics.clear();
  if (!frame) return;
  const inactive = 0x71717a;
  const hover = 0xfb923c;
  const selected = 0xfacc15;
  const active = 0x22d3ee;
  const outline = 0x0f172a;
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  for (const line of frame.boneLines) {
    const isSelected = line.isMultiSelected || line.isSelected;
    const isHot = isSelected || line.isActive || line.isHovered;
    const color = line.isHovered
      ? hover
      : isSelected
        ? selected
        : line.isActive
          ? active
          : inactive;
    const arrow = getBoneArrowPoints(
      line.x1,
      line.y1,
      line.x2,
      line.y2,
      invZoom,
    );
    const [firstPoint, ...remainingPoints] = arrow;
    if (!firstPoint) continue;
    graphics.moveTo(firstPoint.x, firstPoint.y);
    for (const point of remainingPoints) {
      graphics.lineTo(point.x, point.y);
    }
    graphics
      .closePath()
      .fill({ color, alpha: isHot ? 0.38 : 0.22 })
      .stroke({
        width: (isSelected ? 3.5 : isHot ? 3 : 2.5) * invZoom,
        color: outline,
        alpha: isHot ? 0.9 : 0.65,
      });
  }
  for (const connection of frame.connections) {
    graphics
      .moveTo(connection.x1, connection.y1)
      .lineTo(connection.x2, connection.y2)
      .stroke({ width: 1.5 * invZoom, color: active, alpha: 0.55 });
  }
  const jointRadius = 4.25 * invZoom;
  for (const joint of frame.joints) {
    const isSelected = joint.isMultiSelected || joint.isSelected;
    const isHot = isSelected || joint.isActive || joint.isHovered;
    const color = joint.isHovered
      ? hover
      : isSelected
        ? selected
        : joint.isActive
          ? active
          : inactive;
    graphics
      .circle(
        joint.x,
        joint.y,
        isSelected
          ? jointRadius * 1.45
          : isHot
            ? jointRadius * 1.2
            : jointRadius,
      )
      .fill({ color, alpha: 0.9 })
      .stroke({
        width: isSelected ? 1.5 * invZoom : isHot ? 1.25 * invZoom : 0,
        color: 0xffffff,
        alpha: isSelected ? 0.95 : isHot ? 0.9 : 0,
      });
  }
  const transform = frame.boneTransformFrame;
  if (transform) {
    const ringRadius = (transform.rotateRingRadius ?? 24) * invZoom;
    graphics.moveTo(
      transform.rotateHandle.x + ringRadius,
      transform.rotateHandle.y,
    );
    graphics
      .circle(transform.rotateHandle.x, transform.rotateHandle.y, ringRadius)
      .stroke({ width: 1.5 * invZoom, color: active, alpha: 0.85 })
      .fill({ color: 0xffffff, alpha: 0.001 });
    graphics
      .moveTo(transform.start.x, transform.start.y)
      .lineTo(transform.rotateHandle.x, transform.rotateHandle.y)
      .stroke({ width: invZoom, color: active, alpha: 0.45 });
    graphics
      .circle(
        transform.lengthHandle.x,
        transform.lengthHandle.y,
        (transform.lengthHandleRadius ?? 7) * 0.78 * invZoom,
      )
      .fill({ color: 0xec4899, alpha: 0.95 })
      .stroke({ width: 1.25 * invZoom, color: 0xffffff, alpha: 0.9 });
  }
  const pose = frame.poseHandleFrame;
  if (!pose) return;
  graphics
    .moveTo(pose.pivot.x, pose.pivot.y)
    .lineTo(pose.handle.x, pose.handle.y)
    .stroke({ width: 2 * invZoom, color: selected, alpha: 0.95 });
  graphics
    .circle(pose.boneTip.x, pose.boneTip.y, 3 * invZoom)
    .fill({ color: selected, alpha: 0.95 })
    .stroke({ width: 0.85 * invZoom, color: 0xffffff, alpha: 0.8 });
  graphics
    .circle(pose.handle.x, pose.handle.y, 6 * invZoom)
    .fill({ color: 0xef4444, alpha: 0.95 })
    .stroke({ width: 1.5 * invZoom, color: outline, alpha: 1 });
  graphics
    .circle(pose.handle.x, pose.handle.y, 2 * invZoom)
    .fill({ color: outline, alpha: 1 });
}
