import type { Node, Vertex } from "@kukla2d/contracts";

import { mat3Identity, mat3Inverse } from "@/domain/transforms.js";
import type { Matrix3 } from "@/domain/transforms.types.js";

import type { GizmoFrame } from "./gizmoFrame.types.js";

const ROT_OFFSET_PX = 52;

/**
 * Compute gizmo overlay geometry in world-space.
 *
 * Extracted from GizmoOverlay.jsx. Pure function — no React, DOM, or Pixi imports.
 *
 * @param {Object}  args.selectedNode    - the currently selected non-warp node (or null)
 * @param {Array}   args.effectiveNodes  - buildFramePose output
 * @param {Map}     args.worldMatrices   - computeWorldMatrices output
 * @returns {Object} gizmo frame with world-space coordinates
 */
interface Point {
  x: number;
  y: number;
}

interface GizmoFrameInput {
  selectedNode: Node | null | undefined;
  effectiveNodes: readonly Node[];
  worldMatrices: ReadonlyMap<string, Matrix3>;
}

export function buildGizmoFrame({
  selectedNode,
  effectiveNodes,
  worldMatrices,
}: GizmoFrameInput): GizmoFrame {
  if (!selectedNode || selectedNode.type === "warpDeformer") {
    return {
      bboxPoints: [],
      pivot: { x: 0, y: 0 },
      center: { x: 0, y: 0 },
      topCenter: { x: 0, y: 0 },
      rotationHandle: { x: 0, y: 0 },
      visible: false,
    };
  }

  const wm = worldMatrices.get(selectedNode.id) ?? mat3Identity();
  const t = selectedNode.transform ?? {};
  const pivX = t.pivotX ?? 0;
  const pivY = t.pivotY ?? 0;

  const worldPivX = wm[0] * pivX + wm[3] * pivY + wm[6];
  const worldPivY = wm[1] * pivX + wm[4] * pivY + wm[7];

  const iswm = mat3Inverse(wm);
  let bbMinX = Infinity,
    bbMinY = Infinity,
    bbMaxX = -Infinity,
    bbMaxY = -Infinity;

  function pushPoint(wx: number, wy: number): void {
    const lx = iswm[0] * wx + iswm[3] * wy + iswm[6];
    const ly = iswm[1] * wx + iswm[4] * wy + iswm[7];
    if (lx < bbMinX) bbMinX = lx;
    if (lx > bbMaxX) bbMaxX = lx;
    if (ly < bbMinY) bbMinY = ly;
    if (ly > bbMaxY) bbMaxY = ly;
  }

  function traverse(node: Node): void {
    if (node.type === "part") {
      if (node.mesh?.vertices) {
        const nwm = worldMatrices.get(node.id) ?? mat3Identity();
        for (const v of node.mesh.vertices) {
          pushPoint(
            nwm[0] * v.x + nwm[3] * v.y + nwm[6],
            nwm[1] * v.x + nwm[4] * v.y + nwm[7],
          );
        }
      } else if (node.imageBounds) {
        const nwm = worldMatrices.get(node.id) ?? mat3Identity();
        const {
          minX: bminX,
          minY: bminY,
          maxX: bmaxX,
          maxY: bmaxY,
        } = node.imageBounds;
        const corners: [number, number][] = [
          [bminX, bminY],
          [bmaxX, bminY],
          [bmaxX, bmaxY],
          [bminX, bmaxY],
        ];
        for (const [vx, vy] of corners) {
          pushPoint(
            nwm[0] * vx + nwm[3] * vy + nwm[6],
            nwm[1] * vx + nwm[4] * vy + nwm[7],
          );
        }
      }
    }
    const children = effectiveNodes.filter((c) => c.parent === node.id);
    for (const c of children) traverse(c);
  }

  traverse(selectedNode);

  let minX = -50,
    maxX = 50,
    minY = -50,
    maxY = 50;
  if (bbMinX !== Infinity) {
    minX = bbMinX;
    maxX = bbMaxX;
    minY = bbMinY;
    maxY = bbMaxY;
  }

  function toWorld(lx: number, ly: number): Point {
    return {
      x: wm[0] * lx + wm[3] * ly + wm[6],
      y: wm[1] * lx + wm[4] * ly + wm[7],
    };
  }

  const pt0 = toWorld(minX, minY);
  const pt1 = toWorld(maxX, minY);
  const pt2 = toWorld(maxX, maxY);
  const pt3 = toWorld(minX, maxY);
  const bboxPoints = [pt0, pt1, pt2, pt3];
  let outlineContours = null;
  if (selectedNode.type === "part" && selectedNode.alphaContours?.length) {
    outlineContours = selectedNode.alphaContours.map((contour) =>
      contour.map(([x, y]) => toWorld(x, y)),
    );
  } else if (
    selectedNode.type === "part" &&
    (selectedNode.mesh?.edgeIndices?.length ?? 0) >= 3
  ) {
    const mesh = selectedNode.mesh!;
    outlineContours = [
      mesh.edgeIndices
        .map((index) => mesh.vertices[index])
        .filter((vertex): vertex is Vertex => vertex !== undefined)
        .map((vertex) => toWorld(vertex.x, vertex.y)),
    ];
  }

  const localCx = (minX + maxX) / 2;
  const localCy = (minY + maxY) / 2;
  const topCenter = toWorld(localCx, minY);
  const center = toWorld(localCx, localCy);

  const upX = -wm[3];
  const upY = -wm[4];
  const len = Math.sqrt(upX * upX + upY * upY) || 1;
  const dirX = upX / len;
  const dirY = upY / len;
  const rotationHandle = {
    x: topCenter.x + dirX * ROT_OFFSET_PX,
    y: topCenter.y + dirY * ROT_OFFSET_PX,
  };

  return {
    bboxPoints,
    outlineContours,
    pivot: { x: worldPivX, y: worldPivY },
    center,
    topCenter,
    rotationHandle,
    visible: true,
  };
}
