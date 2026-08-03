import type { Bone, Canvas, Constraint, Node, PartNode, ProjectDocument, Vertex } from '@kukla2d/contracts';

import type { PoseOverrides } from '@/domain/animationEngine';
import { HOVER_SOURCE_PANEL, resolveVisibleHoverHit } from '@/domain/hoverPolicy.js';
import { computeWorldMatrices } from '@/domain/transforms';
import type { Matrix3 } from '@/domain/transforms';

import { buildFramePose } from './framePose.js';
import { getIkTargetRadius } from './ikOverlaySizing.js';
import { computeMeshWeightStats } from './meshWeighting.js';
import { getBoneSegment } from './picking.js';



import type { ViewTransform } from './coordinates.js';
import type { FrameAnimationState, FramePose } from './framePose.js';
import type { EffectiveMeshFrame } from './meshDeformation.js';
import type { ScreenRect } from './workflowContracts.js';

interface OverlayInteraction {
  kind: string;
  constraintId?: string;
  boneId?: string;
}

interface CanvasOverlayEditorState {
  selection?: readonly string[];
  activeTool?: string;
  toolMode?: string;
  selectionTarget?: string;
  hoverHit?: string | null;
  hoverSource?: string | null;
  activeBoneId?: string | null;
  weightPaintMode?: boolean;
  weightPaintBoneId?: string | null;
  drawBonePreview?: { startX: number; startY: number; endX: number; endY: number } | null;
  marqueeBox?: ScreenRect | null;
  view?: ViewTransform;
  meshEditMode?: boolean;
  meshSubMode?: string;
  blendShapeEditMode?: boolean;
  showExportArea?: boolean;
  brushSize?: number;
  interaction?: OverlayInteraction | null;
  editorMode?: string;
}

interface OverlayFramePose extends Pick<FramePose, 'poseOverrides' | 'effectiveNodes' | 'effectiveBones' | 'effectiveMeshes'> {
  worldMatrices?: ReadonlyMap<string, Matrix3>;
}

interface CanvasOverlayFrameInput {
  project: ProjectDocument;
  editorState: CanvasOverlayEditorState;
  animationState: FrameAnimationState;
  framePose?: OverlayFramePose | null;
}

/**
 * Pure DTO for overlay rendering.
 *
 * Collects all data needed by PixiOverlayRenderer
 * without importing React, Zustand, DOM, Pixi, or WebGL.
 */
function buildCanvasOverlayFrameImpl({ project, editorState, animationState, framePose }: CanvasOverlayFrameInput) {
  const pose = framePose ?? buildFramePose({
    project,
    editorState,
    animationState,
  });
  const { effectiveNodes, effectiveBones, effectiveMeshes } = pose;
  const worldMatrices = framePose?.worldMatrices ?? computeWorldMatrices(effectiveNodes);

  const selection = editorState?.selection ?? [];
  const activeTool = editorState?.activeTool ?? editorState?.toolMode ?? 'select';
  const selectionTarget = editorState?.selectionTarget ?? 'all';
  const showsElementChrome = ['select', 'transform'].includes(activeTool)
    && ['all', 'element'].includes(selectionTarget);
  const showsElementHover = ['select', 'transform'].includes(activeTool);
  const selectedNodeId = showsElementChrome && selection.length === 1
    && effectiveNodes.some(node => node.id === selection[0])
    ? selection[0]
    : null;
  const visibleHoverHit = resolveVisibleHoverHit(editorState);
  // Explicit panel identification works in every tool/target. Passive canvas
  // part hover keeps its existing select/transform tool constraint.
  const hoverHit = editorState?.hoverSource === HOVER_SOURCE_PANEL
    ? visibleHoverHit
    : showsElementHover ? visibleHoverHit : null;

  const weightPaintPartId = editorState?.weightPaintMode
    ? selection[0] ?? null
    : null;
  const weightPaintBoneId = editorState?.weightPaintBoneId ?? editorState?.activeBoneId ?? null;

  const drawBonePreview = editorState?.drawBonePreview ?? null;

  const marqueeScreenBox = editorState?.marqueeBox ?? null;
  const view = editorState?.view ?? { zoom: 1, panX: 0, panY: 0 };
  const marqueeWorldBox = marqueeScreenBox
    ? screenToWorldBox(marqueeScreenBox, view)
    : null;

  const weightPaintOverlay = buildWeightPaintOverlayFrame({
    weightPaintPartId,
    weightPaintBoneId,
    effectiveNodes,
    worldMatrices,
    effectiveMeshes,
  });
  const weightPaintPoints = weightPaintOverlay?.visible
    ? weightPaintOverlay.vertices.map((v, i) => ({
      x: v.x, y: v.y, weight: weightPaintOverlay.weights[i] ?? 0,
    }))
    : null;
  const meshWireframe = buildMeshWireframe({
    partId: editorState?.meshEditMode ? selection[0] ?? null : null,
    effectiveNodes,
    worldMatrices,
    effectiveMeshes,
  });
  const ikOverlay = buildIkOverlay({
    project,
    editorState: { ...editorState, hoverHit: visibleHoverHit },
    effectiveBones,
    poseOverrides: pose.poseOverrides,
  });

  // Fail closed: Export Area is session UI and must render only after an
  // explicit opt-in. Missing/partial editor state must preserve default-off.
  const showExportArea = editorState?.showExportArea === true;
  const exportAreaFrame = buildExportAreaOverlayFrame(project.canvas, showExportArea);

  const brushCursor = buildBrushCursor(editorState);

  return {
    selectedNodeId,
    hoverHit,
    weightPaintPartId,
    weightPaintBoneId,
    drawBonePreview,
    marqueeWorldBox,
    weightPaintOverlay,
    weightPaintPoints,
    meshWireframe,
    ikOverlay,
    exportAreaFrame,
    brushCursor,
    effectiveNodes,
    effectiveBones,
    worldMatrices,
  };
}

export type CanvasOverlayFrame = ReturnType<typeof buildCanvasOverlayFrameImpl>;

export const buildCanvasOverlayFrame = (...args: Parameters<typeof buildCanvasOverlayFrameImpl>): CanvasOverlayFrame => buildCanvasOverlayFrameImpl(...args);

interface IkOverlayInput {
  project: Pick<ProjectDocument, 'constraints'>;
  editorState: CanvasOverlayEditorState;
  effectiveBones: readonly Bone[];
  poseOverrides: PoseOverrides | null;
}

function applyConstraintPose(constraint: Constraint, overrides: Record<string, unknown> | undefined): Constraint {
  if (!overrides) return constraint;
  return {
    ...constraint,
    ...(typeof overrides.targetX === 'number' ? { targetX: overrides.targetX } : {}),
    ...(typeof overrides.targetY === 'number' ? { targetY: overrides.targetY } : {}),
    ...(typeof overrides.mix === 'number' ? { mix: overrides.mix } : {}),
    ...(typeof overrides.fkIk === 'number' ? { fkIk: overrides.fkIk } : {}),
    ...(typeof overrides.bendPositive === 'boolean' ? { bendPositive: overrides.bendPositive } : {}),
  };
}

function buildIkOverlay({ project, editorState, effectiveBones, poseOverrides }: IkOverlayInput) {
  const constraints = (project.constraints ?? [])
    .map(constraint => applyConstraintPose(constraint, poseOverrides?.get(constraint.id)));
  const boneMap = new Map<string, Bone>(effectiveBones.map(bone => [bone.id, bone]));
  const targets = constraints.flatMap(constraint => {
    if (typeof constraint.targetX !== 'number' || !Number.isFinite(constraint.targetX)
      || typeof constraint.targetY !== 'number' || !Number.isFinite(constraint.targetY)) return [];
    return [{
      id: constraint.id,
      name: constraint.name,
      x: constraint.targetX,
      y: constraint.targetY,
      color: constraint.color ?? 0x22d3ee,
      assigned: !!constraint.assignedBoneId,
      radius: getIkTargetRadius(constraint.assignedBoneId ? boneMap.get(constraint.assignedBoneId) : null),
      selected: editorState?.selection?.includes(constraint.id) ?? false,
      hovered: editorState.hoverHit === `constraint:${constraint.id}`,
    }];
  });

  let preview: { x1: number; y1: number; x2: number; y2: number; color: number; alpha: number } | null = null;
  if (editorState.interaction?.kind === 'pendingPickIKBone'
    || editorState.interaction?.kind === 'pendingSuggestIKBone') {
    const interaction = editorState.interaction;
    const constraint = interaction?.constraintId
      ? constraints.find(item => item.id === interaction.constraintId)
      : undefined;
    const hoverBoneId = interaction?.kind === 'pendingSuggestIKBone'
      ? interaction.boneId ?? null
      : typeof editorState.hoverHit === 'string' && editorState.hoverHit.startsWith('bone:')
        ? editorState.hoverHit.slice(5)
        : null;
    const bone = hoverBoneId ? boneMap.get(hoverBoneId) : undefined;
    if (constraint && bone && typeof constraint.targetX === 'number' && typeof constraint.targetY === 'number') {
      const segment = getBoneSegment(bone, boneMap);
      preview = {
        x1: constraint.targetX,
        y1: constraint.targetY,
        x2: segment.x2,
        y2: segment.y2,
        color: constraint.color ?? 0x22d3ee,
        alpha: 0.9,
      };
    }
  }
  if (!preview && typeof editorState?.hoverHit === 'string'
    && editorState.hoverHit.startsWith('constraint:')) {
    const constraintId = editorState.hoverHit.slice('constraint:'.length);
    const constraint = constraints.find(item => item.id === constraintId);
    const bone = constraint?.assignedBoneId ? boneMap.get(constraint.assignedBoneId) : undefined;
    if (constraint && bone && typeof constraint.targetX === 'number' && typeof constraint.targetY === 'number') {
      const segment = getBoneSegment(bone, boneMap);
      preview = {
        x1: constraint.targetX,
        y1: constraint.targetY,
        x2: segment.x2,
        y2: segment.y2,
        color: constraint.color ?? 0x22d3ee,
        alpha: 0.35,
      };
    }
  }
  if (!preview && typeof editorState?.hoverHit === 'string'
    && editorState.hoverHit.startsWith('bone:')) {
    const boneId = editorState.hoverHit.slice('bone:'.length);
    const isActive = editorState.activeBoneId === boneId
      || editorState.selection?.includes(boneId);
    const constraint = !isActive
      ? constraints.find(item => item.type === 'ik'
        && item.enabled !== false
        && (item.assignedBoneId === boneId || item.affectedBoneIds.some(id => id === boneId))
        && Number.isFinite(item.targetX)
        && Number.isFinite(item.targetY))
      : null;
    const bone = boneMap.get(boneId);
    if (constraint && bone && typeof constraint.targetX === 'number' && typeof constraint.targetY === 'number') {
      const segment = getBoneSegment(bone, boneMap);
      preview = {
        x1: constraint.targetX,
        y1: constraint.targetY,
        x2: segment.x2,
        y2: segment.y2,
        color: constraint.color ?? 0x22d3ee,
        alpha: 0.55,
      };
    }
  }
  return { targets, preview };
}

interface MeshOverlayInput {
  partId: string | null;
  effectiveNodes: readonly Node[];
  worldMatrices: ReadonlyMap<string, Matrix3>;
  effectiveMeshes: ReadonlyMap<string, EffectiveMeshFrame>;
}

function buildMeshWireframe({ partId, effectiveNodes, worldMatrices, effectiveMeshes }: MeshOverlayInput) {
  if (!partId) return null;
  const part = effectiveNodes.find((node): node is PartNode => node.id === partId && node.type === 'part');
  if (!part?.mesh?.vertices?.length || !part.mesh.triangles?.length) return null;
  const wm = worldMatrices?.get(part.id);
  if (!wm) return null;

  const effectiveFrame = effectiveMeshes?.get?.(partId);
  const sourceVertices = effectiveFrame?.vertices ?? part.mesh.vertices;
  const triangles = formatTriangles(effectiveFrame?.triangles?.length
    ? effectiveFrame.triangles
    : part.mesh.triangles);

  const vertices = sourceVertices.map((vertex: Vertex) => {
    const x = vertex.x ?? vertex.restX ?? 0;
    const y = vertex.y ?? vertex.restY ?? 0;
    return {
      x: wm[0] * x + wm[3] * y + wm[6],
      y: wm[1] * x + wm[4] * y + wm[7],
    };
  });
  return { vertices, triangles };
}

type TriangleInput = readonly (readonly [number, number, number])[] | readonly number[];

function isTriangleTupleArray(
  triangles: TriangleInput,
): triangles is readonly (readonly [number, number, number])[] {
  return typeof triangles[0] !== 'number';
}

function formatTriangles(triangles: TriangleInput | null | undefined): number[][] {
  if (!triangles || triangles.length === 0) return [];
  if (isTriangleTupleArray(triangles)) {
    return triangles.map(triangle => [triangle[0], triangle[1], triangle[2]]);
  }
  return Array.from({ length: Math.floor(triangles.length / 3) },
    (_, index) => triangles.slice(index * 3, index * 3 + 3));
}

function screenToWorldBox(box: ScreenRect, view: ViewTransform): ScreenRect {
  const invZoom = view.zoom !== 0 ? 1 / view.zoom : 1;
  return {
    x: (box.x - view.panX) * invZoom,
    y: (box.y - view.panY) * invZoom,
    w: box.w * invZoom,
    h: box.h * invZoom,
  };
}

function buildWeightPaintOverlayFrame({
  weightPaintPartId,
  weightPaintBoneId,
  effectiveNodes,
  worldMatrices,
  effectiveMeshes,
}: {
  weightPaintPartId: string | null;
  weightPaintBoneId: string | null;
  effectiveNodes: readonly Node[];
  worldMatrices: ReadonlyMap<string, Matrix3>;
  effectiveMeshes: ReadonlyMap<string, EffectiveMeshFrame>;
}) {
  if (!weightPaintPartId || !weightPaintBoneId) return null;
  const part = effectiveNodes.find((node): node is PartNode => node.id === weightPaintPartId && node.type === 'part');
  if (!part?.mesh?.vertices?.length) return null;
  const mesh = part.mesh;

  const wm = worldMatrices?.get(part.id);
  if (!wm) return null;

  const effectiveFrame = effectiveMeshes?.get?.(part.id);
  const sourceVertices = effectiveFrame?.vertices ?? mesh.vertices;

  const triangles = formatTriangles(effectiveFrame?.triangles?.length
    ? effectiveFrame.triangles
    : mesh.triangles);

  const vertices = sourceVertices.map((vertex: Vertex) => {
    const vx = vertex.x ?? vertex.restX ?? 0;
    const vy = vertex.y ?? vertex.restY ?? 0;
    return {
      x: wm[0] * vx + wm[3] * vy + wm[6],
      y: wm[1] * vx + wm[4] * vy + wm[7],
    };
  });

  const weights = sourceVertices.map((_vertex: Vertex, i: number) => {
    const influences = mesh.influences?.[i] ?? [];
    const inf = influences.find(inf => inf.boneId === weightPaintBoneId);
    return inf?.weight ?? 0;
  });

  const stats = computeMeshWeightStats(mesh, mesh.influences
    ?.flat()
    .find(influence => influence.boneId === weightPaintBoneId)?.boneId ?? null);

  return { visible: true, vertices, triangles, weights, selectedBoneId: weightPaintBoneId, stats };
}

export function buildExportAreaOverlayFrame(
  canvas: Canvas | null | undefined,
  showExportArea = false,
): { x: number; y: number; width: number; height: number; valid: boolean } {
  if (!canvas || !showExportArea) {
    return { x: 0, y: 0, width: 0, height: 0, valid: false };
  }
  const x = Number.isFinite(canvas.x) ? canvas.x : 0;
  const y = Number.isFinite(canvas.y) ? canvas.y : 0;
  const width = Number.isFinite(canvas.width) && canvas.width > 0 ? canvas.width : 0;
  const height = Number.isFinite(canvas.height) && canvas.height > 0 ? canvas.height : 0;
  return { x, y, width, height, valid: width > 0 && height > 0 };
}

function buildBrushCursor(editorState: CanvasOverlayEditorState | null | undefined): { brushSize: number } | null {
  if (!editorState) return null;
  const inBrushMode = editorState.weightPaintMode
    || (editorState.meshEditMode && editorState.meshSubMode === 'deform')
    || editorState.blendShapeEditMode;
  if (!inBrushMode) return null;
  const brushSize = editorState.brushSize ?? 20;
  return { brushSize };
}
