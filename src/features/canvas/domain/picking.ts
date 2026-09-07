/**
 * Picking helpers - vertex/alpha hit testing.
 *
 * Pure helpers used by input routing. No React, DOM, or WebGL dependencies.
 * `worldToLocal` centralizes inverse-matrix behavior.
 */
import type {
  Bone,
  BoneId,
  Constraint,
  ConstraintId,
  Node,
  PartNode,
  Vertex,
} from "@kukla2d/contracts";

import { mat3Inverse } from "@/domain/transforms";

import { worldToLocal } from "./coordinates.js";

import type { ScreenRect } from "./workflowContracts.types.js";

type Matrix3 = Parameters<typeof mat3Inverse>[0];
interface BoneSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Find the vertex index closest to (x, y) within `radius`. Returns -1 if none.
 */
export function findNearestVertex(
  vertices: readonly Vertex[],
  x: number,
  y: number,
  radius: number,
): number {
  const r2 = radius * radius;
  let best = -1,
    bestD = r2;
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i]!;
    const dx = vertex.x - x;
    const dy = vertex.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * Sample alpha (0-255) at integer pixel coords from an ImageData. Returns 0 if out-of-bounds.
 */
export function sampleAlpha(
  imageData: ImageData,
  lx: number,
  ly: number,
): number {
  const ix = Math.floor(lx),
    iy = Math.floor(ly);
  if (ix < 0 || iy < 0 || ix >= imageData.width || iy >= imageData.height)
    return 0;
  return imageData.data[(iy * imageData.width + ix) * 4 + 3] ?? 0;
}

/**
 * Sort parts by descending draw_order.
 */
export function sortPartsForPicking(nodes: readonly PartNode[]): PartNode[] {
  return [...nodes].sort((a, b) => (b.draw_order ?? 0) - (a.draw_order ?? 0));
}

/**
 * Find the topmost part whose alpha (in imageData) is non-zero at the local point
 * (worldX, worldY) transformed by `worldMatrices[part.id]`.
 *
 * @param {Object}   args
 * @param {Array}    args.parts             - nodes with imageData available
 * @param {Map}      args.imageDataByPartId
 * @param {Map}      args.worldMatrices     - Map<partId, mat3> local→world
 * @param {number}   args.worldX
 * @param {number}   args.worldY
 * @param {number}   [args.zoom]            - currently unused; reserved for future radius-based picking
 * @returns {string|null}  partId or null
 */
export function findAlphaHit({
  parts,
  imageDataByPartId,
  worldMatrices,
  worldX,
  worldY,
  zoom,
}: {
  parts: readonly PartNode[];
  imageDataByPartId: ReadonlyMap<string, ImageData>;
  worldMatrices: ReadonlyMap<string, Matrix3>;
  worldX: number;
  worldY: number;
  zoom?: number;
}): string | null {
  // Retain zoom in the stable input contract for future radius-based picking.
  void zoom;
  for (const part of sortPartsForPicking(parts)) {
    const id = part.id;
    const imageData = imageDataByPartId.get(id);
    const wm = worldMatrices.get(id);
    if (!imageData || !wm) continue;
    const inv = mat3Inverse(wm);
    const [lx, ly] = worldToLocal(worldX, worldY, inv);
    if (sampleAlpha(imageData, lx, ly) > 0) return id;
  }
  return null;
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const sx = x1 + dx * t;
  const sy = y1 + dy * t;
  return Math.hypot(px - sx, py - sy);
}

export function getBoneSegment(
  bone: Bone,
  boneMap: ReadonlyMap<string, Bone>,
): BoneSegment {
  void boneMap;
  const x = bone.setup?.x ?? 0;
  const y = bone.setup?.y ?? 0;
  const setupLength = bone.setup?.length ?? 80;
  const effectiveLength = setupLength * Math.abs(bone.setup?.scaleX ?? 1);
  const radians = ((bone.setup?.rotation ?? 0) * Math.PI) / 180;
  return {
    x1: x,
    y1: y,
    x2: x + Math.cos(radians) * effectiveLength,
    y2: y + Math.sin(radians) * effectiveLength,
  };
}

export function findBoneHit({
  bones,
  worldX,
  worldY,
  zoom = 1,
  radiusPx = 10,
}: {
  bones: readonly Bone[];
  worldX: number;
  worldY: number;
  zoom?: number;
  radiusPx?: number;
}): BoneId | null {
  const boneMap = new Map(bones.map((bone) => [bone.id, bone]));
  const radius = radiusPx / Math.max(zoom || 1, 0.001);
  let best: BoneId | null = null;
  let bestD = radius;
  for (const bone of bones) {
    const seg = getBoneSegment(bone, boneMap);
    const d = distanceToSegment(worldX, worldY, seg.x1, seg.y1, seg.x2, seg.y2);
    if (d <= bestD) {
      best = bone.id;
      bestD = d;
    }
  }
  return best;
}

export function findConstraintTargetHit({
  constraints,
  worldX,
  worldY,
  zoom = 1,
  radiusPx = 14,
}: {
  constraints: readonly Constraint[];
  worldX: number;
  worldY: number;
  zoom?: number;
  radiusPx?: number;
}): ConstraintId | null {
  const radius = radiusPx / Math.max(zoom || 1, 0.001);
  let best: ConstraintId | null = null;
  let bestDistance = radius;
  for (const constraint of constraints ?? []) {
    const { targetX, targetY } = constraint;
    if (
      typeof targetX !== "number" ||
      !Number.isFinite(targetX) ||
      typeof targetY !== "number" ||
      !Number.isFinite(targetY)
    )
      continue;
    const distance = Math.hypot(worldX - targetX, worldY - targetY);
    if (distance <= bestDistance) {
      best = constraint.id;
      bestDistance = distance;
    }
  }
  return best;
}

export function selectElementsInRect({
  nodes,
  worldMatrices,
  rect,
}: {
  nodes: readonly Node[];
  worldMatrices: ReadonlyMap<string, Matrix3>;
  rect: ScreenRect;
}): string[] {
  const minX = Math.min(rect.x, rect.x + rect.w);
  const maxX = Math.max(rect.x, rect.x + rect.w);
  const minY = Math.min(rect.y, rect.y + rect.h);
  const maxY = Math.max(rect.y, rect.y + rect.h);
  return nodes
    .filter((node) => {
      if (node.type !== "part") return false;
      const matrix = worldMatrices.get(node.id);
      const width = node.imageWidth ?? 0;
      const height = node.imageHeight ?? 0;
      if (!matrix || !width || !height) return false;
      const corners = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].map(([x = 0, y = 0]) => ({
        x: (matrix[0] ?? 0) * x + (matrix[3] ?? 0) * y + (matrix[6] ?? 0),
        y: (matrix[1] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[7] ?? 0),
      }));
      const left = Math.min(...corners.map((point) => point.x));
      const right = Math.max(...corners.map((point) => point.x));
      const top = Math.min(...corners.map((point) => point.y));
      const bottom = Math.max(...corners.map((point) => point.y));
      return !(right < minX || left > maxX || bottom < minY || top > maxY);
    })
    .map((node) => node.id);
}

/**
 * Pure helper: pick bones whose segment crosses a world-space marquee rect.
 * A bone is included when either endpoint sits inside the rect, or the
 * segment crosses a rect edge. No DOM/React/Zustand dependency.
 *
 * @param {object} args
 * @param {Array}  args.bones  - bone list (must contain `id` and `setup`)
 * @param {{x:number,y:number,w:number,h:number}} args.rect  - world rect
 * @returns {string[]} selected bone ids, in the same order as `bones`
 */
export function selectBonesInRect({
  bones,
  rect,
}: {
  bones: readonly Bone[];
  rect: ScreenRect;
}): string[] {
  if (!bones?.length || !rect) return [];
  const minX = Math.min(rect.x, rect.x + rect.w);
  const maxX = Math.max(rect.x, rect.x + rect.w);
  const minY = Math.min(rect.y, rect.y + rect.h);
  const maxY = Math.max(rect.y, rect.y + rect.h);
  const boneMap = new Map(bones.map((bone) => [bone.id, bone]));
  const out: string[] = [];
  for (const bone of bones) {
    const seg = getBoneSegment(bone, boneMap);
    if (segmentIntersectsRect(seg, minX, minY, maxX, maxY)) {
      out.push(bone.id);
    }
  }
  return out;
}

function pointInRect(
  px: number,
  py: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function segmentIntersectsRect(
  seg: BoneSegment,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  if (pointInRect(seg.x1, seg.y1, minX, minY, maxX, maxY)) return true;
  if (pointInRect(seg.x2, seg.y2, minX, minY, maxX, maxY)) return true;
  return (
    segmentIntersectsEdge(seg, minX, minY, maxX, minY) ||
    segmentIntersectsEdge(seg, maxX, minY, maxX, maxY) ||
    segmentIntersectsEdge(seg, minX, maxY, maxX, maxY) ||
    segmentIntersectsEdge(seg, minX, minY, minX, maxY)
  );
}

function segmentIntersectsEdge(
  seg: BoneSegment,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const d1 = (bx - ax) * (seg.y1 - ay) - (seg.x1 - ax) * (by - ay);
  const d2 = (bx - ax) * (seg.y2 - ay) - (seg.x2 - ax) * (by - ay);
  if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
    const d3 =
      (seg.x2 - seg.x1) * (ay - seg.y1) - (seg.y2 - seg.y1) * (ax - seg.x1);
    const d4 =
      (seg.x2 - seg.x1) * (by - seg.y1) - (seg.y2 - seg.y1) * (bx - seg.x1);
    if ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)) return true;
  }
  return false;
}

/**
 * Pure helper: pick IK constraints whose target bone segment crosses the
 * marquee rect. Each constraint is expected to be `{ id, targetBoneId }`
 * (the workspace-visible IK constraint surface; other constraint fields
 * stay in the domain solver and are ignored here).
 *
 * @param {object} args
 * @param {Array}  args.constraints  - constraint list (objects with `id` and `targetBoneId`)
 * @param {Array}  args.bones        - bone list (used to resolve `targetBoneId` to a segment)
 * @param {{x:number,y:number,w:number,h:number}} args.rect
 * @returns {string[]} selected constraint ids, in the order of `constraints`
 */
export function selectConstraintsInRect({
  constraints,
  bones,
  rect,
}: {
  constraints: readonly Constraint[];
  bones: readonly Bone[];
  rect: ScreenRect;
}): string[] {
  if (!constraints?.length || !bones?.length || !rect) return [];
  const minX = Math.min(rect.x, rect.x + rect.w);
  const maxX = Math.max(rect.x, rect.x + rect.w);
  const minY = Math.min(rect.y, rect.y + rect.h);
  const maxY = Math.max(rect.y, rect.y + rect.h);
  const boneMap = new Map(bones.map((bone) => [bone.id, bone]));
  const out: string[] = [];
  for (const c of constraints) {
    const { targetX, targetY } = c;
    if (
      typeof targetX === "number" &&
      Number.isFinite(targetX) &&
      typeof targetY === "number" &&
      Number.isFinite(targetY)
    ) {
      if (
        targetX >= minX &&
        targetX <= maxX &&
        targetY >= minY &&
        targetY <= maxY
      ) {
        out.push(c.id);
      }
      continue;
    }
    const targetBone = c.targetBoneId ? boneMap.get(c.targetBoneId) : null;
    if (!targetBone) continue;
    const seg = getBoneSegment(targetBone, boneMap);
    if (segmentIntersectsRect(seg, minX, minY, maxX, maxY)) {
      out.push(c.id);
    }
  }
  return out;
}

/**
 * Pure helper for the workspace bone-click modifier flow. Given the current
 * rig selection ids, the bone that was just hit, modifier keys and the
 * (stable) ordered list of bone ids for the project, returns the next
 * selection that the canvas / panel should commit.
 *
 * - No modifier: single-bone selection (replaces previous).
 * - Ctrl/Cmd: toggle the hit bone in the existing rig selection.
 * - Shift: range from the anchor (when present and within the ordered list)
 *   to the hit bone, inclusive.
 *
 * @param {object} args
 * @param {string[]} args.orderedBoneIds  Stable bone order (e.g. project.bones).
 * @param {string[]} args.currentSelection  Existing selection (may be a mix; only bones are considered).
 * @param {string|null} args.anchorBoneId  Anchor for shift range, or null.
 * @param {string} args.boneHit  Bone id that was hit.
 * @param {boolean} args.shiftKey
 * @param {boolean} args.ctrlOrMetaKey
 * @returns {string[]} Next selection (may be empty).
 */
export function computeBoneSelectionFromClick({
  orderedBoneIds,
  currentSelection,
  anchorBoneId,
  boneHit,
  shiftKey,
  ctrlOrMetaKey,
}: {
  orderedBoneIds: readonly string[];
  currentSelection: readonly string[];
  anchorBoneId: string | null;
  boneHit: string;
  shiftKey: boolean;
  ctrlOrMetaKey: boolean;
}): string[] {
  if (!boneHit) return [];
  const order: readonly string[] = orderedBoneIds;
  const current = currentSelection.filter((id) => order.includes(id));

  if (shiftKey) {
    const aIdx = anchorBoneId ? order.indexOf(anchorBoneId) : -1;
    const cIdx = order.indexOf(boneHit);
    if (aIdx < 0 || cIdx < 0) return [boneHit];
    const [lo, hi] = aIdx <= cIdx ? [aIdx, cIdx] : [cIdx, aIdx];
    return order.slice(lo, hi + 1);
  }

  if (ctrlOrMetaKey) {
    if (current.includes(boneHit)) {
      return current.filter((id) => id !== boneHit);
    }
    return [...current, boneHit];
  }

  return [boneHit];
}
