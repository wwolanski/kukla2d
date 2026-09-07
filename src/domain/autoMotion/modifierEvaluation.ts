import type {
  AnimationModifier,
  Bone,
  BoneMotionDriver,
  ModifierOutput,
  PartNode,
  ProjectDocument,
  TimeDriver,
  Vertex,
} from "@kukla2d/contracts";

import { clampFiniteNumber } from "@/lib/math";

import type { BoundingBox } from "./autoMotionTypes.types.js";

type ModifierPoseOverrides = Map<string, Record<string, unknown>>;

type PosePartial = Record<string, Record<string, unknown>>;

type OutputEvaluator = (
  output: ModifierOutput,
  driverValue: number,
  modifier: AnimationModifier,
  project: ProjectDocument,
) => PosePartial | null;

export function evaluateTimeDriver(
  driver: TimeDriver | null | undefined,
  timeMs: number,
): number {
  if (!driver || driver.kind !== "time") return 0;
  const { periodMs, phase, curve } = driver;
  if (!periodMs || !isFinite(periodMs) || periodMs <= 0) return 0;
  if (!isFinite(timeMs)) return 0;

  const phaseOffset = isFinite(phase) ? phase : 0;
  const t = (timeMs / periodMs + phaseOffset / (2 * Math.PI)) % 1;
  const raw = (t + 1) % 1;

  switch (curve) {
    case "sine":
      return (Math.sin(raw * 2 * Math.PI - Math.PI / 2) + 1) / 2;
    case "triangle":
      return raw < 0.5 ? raw * 2 : 2 - raw * 2;
    case "easeInOutSine":
      return (Math.cos(raw * Math.PI) * -1 + 1) / 2;
    default:
      return raw;
  }
}

function isModifierActive(
  modifier: AnimationModifier,
  activeAnimationId: string | null | undefined,
): boolean {
  if (modifier.enabled === false) return false;
  if (modifier.muted === true) return false;
  if (modifier.scope === "clip") {
    if (!activeAnimationId || modifier.clipId !== activeAnimationId)
      return false;
  }
  return true;
}

function evaluateBlendShapeOutput(
  output: ModifierOutput,
  driver01: number,
  modifier: AnimationModifier,
  project: ProjectDocument,
): PosePartial | null {
  const targetKey = output.targetId;
  const targetNode = project.nodes.find(
    (node): node is PartNode => node.id === targetKey && node.type === "part",
  );
  if (!targetNode) return null;

  const strength = modifier.params?.strength ?? 1;
  const amount = output.property
    ? (modifier.params?.[output.property] ?? 1)
    : 1;
  const additive = driver01 * amount * strength;

  if (!targetNode.blendShapes?.length) return null;

  const shapeExists = targetNode.blendShapes.some(
    (s) => s.id === output.property,
  );
  if (!shapeExists) return null;

  const existing = targetNode.blendShapeValues?.[output.property] ?? 0;
  const clamped = Math.max(0, Math.min(1, existing + additive));

  return { [targetKey]: { [`blendShape:${output.property}`]: clamped } };
}

function evaluateNodeTransformOutput(
  output: ModifierOutput,
  driver01: number,
  modifier: AnimationModifier,
  project: ProjectDocument,
): PosePartial | null {
  const targetKey = output.targetId;
  const targetNode = (project.nodes ?? []).find((n) => n.id === targetKey);
  if (!targetNode) return null;

  const strength = modifier.params?.strength ?? 1;
  const property = output.property;
  const amount = getTransformAmount(modifier.params, property);
  const additive = driver01 * amount * strength;

  const transformProps = ["x", "y", "scaleX", "scaleY", "rotation"];
  if (!transformProps.includes(property)) return null;

  const partial: PosePartial = { [targetKey]: { [property]: additive } };
  if (
    targetNode.type === "part" &&
    targetNode.boneId &&
    ["x", "y"].includes(property)
  ) {
    partial[targetNode.boneId] = { [property]: additive };
  }
  return partial;
}

function getTransformAmount(
  params: Record<string, number> = {},
  property: string,
): number {
  const pixelAmount = params[`${property}Px`];
  if (pixelAmount !== undefined) return pixelAmount;
  const directAmount = params[property];
  if (directAmount !== undefined) return directAmount;
  if (property === "y" && params.verticalLiftPx !== undefined)
    return params.verticalLiftPx;
  return 1;
}

function computeBBox(vertices: readonly Vertex[]): BoundingBox {
  if (!vertices?.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    const x = Number.isFinite(v.x) ? v.x : v.restX;
    const y = Number.isFinite(v.y) ? v.y : v.restY;
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y)
    )
      continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function resolveCheekSide(value: unknown): -1 | 0 | 1 {
  const n = Number(value);
  if (n < 0) return -1;
  if (n === 0) return 0;
  return 1;
}

function vertexXY(vertex: Vertex): { x: number; y: number } {
  const x = Number.isFinite(vertex.x) ? vertex.x : vertex.restX;
  const y = Number.isFinite(vertex.y) ? vertex.y : vertex.restY;
  return {
    x: typeof x === "number" && Number.isFinite(x) ? x : 0,
    y: typeof y === "number" && Number.isFinite(y) ? y : 0,
  };
}

function evaluateIdleBreathingMesh(
  vertices: readonly Vertex[],
  driver01: number,
  modifier: AnimationModifier,
): { x: number; y: number }[] {
  const params = modifier.params ?? {};
  const strength = params.strength ?? 1;
  const signal = clampFiniteNumber(driver01 * strength, 0, 1);
  const chestExpandPx = params.chestExpandPx ?? 4;
  const verticalLiftPx = params.verticalLiftPx ?? 16;
  const bbox = computeBBox(vertices);
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const centerY = (bbox.minY + bbox.maxY) / 2;

  return vertices.map((v) => {
    const { x, y } = vertexXY(v);
    const nx = (x - centerX) / width;
    const ny = (y - centerY) / height;
    return {
      x: x + nx * chestExpandPx * signal,
      y: y - verticalLiftPx * signal + ny * chestExpandPx * 0.35 * signal,
    };
  });
}

function evaluateCheekJiggleMesh(
  vertices: readonly Vertex[],
  driver01: number,
  modifier: AnimationModifier,
): { x: number; y: number }[] {
  const params = modifier.params ?? {};
  const strength = params.strength ?? 0.5;
  const signal = clampFiniteNumber(driver01 * strength, 0, 1);
  const jigglePx = params.jigglePx ?? 3;
  const softness = params.softness ?? 0.3;
  const radius = clampFiniteNumber(params.cheekRadius ?? 0.35, 0.12, 0.8);
  const bbox = computeBBox(vertices);
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const hasPoint =
    Number.isFinite(params.cheekPointX) && Number.isFinite(params.cheekPointY);
  const focusX = hasPoint ? params.cheekPointX! : bbox.minX + width * 0.68;
  const focusY = hasPoint ? params.cheekPointY! : bbox.minY + height * 0.58;
  const side = hasPoint
    ? focusX < bbox.minX + width * 0.45
      ? -1
      : focusX > bbox.minX + width * 0.55
        ? 1
        : 0
    : resolveCheekSide(params.cheekSide ?? 1);

  return vertices.map((v) => {
    const { x, y } = vertexXY(v);
    const dx = (x - focusX) / width;
    const dy = (y - focusY) / height;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radiusFalloff = Math.max(0, 1 - dist / radius);
    const falloff = Math.pow(radiusFalloff, 1 + softness * 2);
    const direction = side === 0 ? (x < focusX ? -1 : 1) : side;
    return {
      x: x + direction * jigglePx * falloff * signal,
      y:
        y +
        Math.max(0, 1 - Math.abs(dy) / radius) *
          jigglePx *
          0.35 *
          falloff *
          signal,
    };
  });
}

function evaluateMeshDeltaOutput(
  output: ModifierOutput,
  driver01: number,
  modifier: AnimationModifier,
  project: ProjectDocument,
): PosePartial | null {
  const targetNode = project.nodes.find(
    (node): node is PartNode =>
      node.id === output.targetId && node.type === "part",
  );
  const vertices = targetNode?.mesh?.vertices;
  if (!Array.isArray(vertices) || vertices.length < 3) return null;

  if (modifier.presetId === "builtin.idleBreathing") {
    return {
      [output.targetId]: {
        mesh_verts: evaluateIdleBreathingMesh(vertices, driver01, modifier),
      },
    };
  }

  if (modifier.presetId === "builtin.headCheekJiggle") {
    return {
      [output.targetId]: {
        mesh_verts: evaluateCheekJiggleMesh(vertices, driver01, modifier),
      },
    };
  }

  return null;
}

function evaluateBoneTransformOutput(
  output: ModifierOutput,
  driver01: number,
  modifier: AnimationModifier,
  project: ProjectDocument,
): PosePartial | null {
  const targetKey = output.targetId;
  const targetBone = (project.bones ?? []).find((b) => b.id === targetKey);
  if (!targetBone) return null;

  const strength = modifier.params?.strength ?? 1;
  const amount = getTransformAmount(modifier.params, output.property);
  const additive = driver01 * amount * strength;

  return { [targetKey]: { [output.property]: additive } };
}

const outputEvaluators: Partial<
  Record<ModifierOutput["kind"], OutputEvaluator>
> = {
  blendShapeValue: evaluateBlendShapeOutput,
  nodeTransform: evaluateNodeTransformOutput,
  boneTransform: evaluateBoneTransformOutput,
  meshDelta: evaluateMeshDeltaOutput,
};

export function evaluateAnimationModifiers({
  project,
  activeAnimationId,
  timeMs,
  previewModifierDraft,
}: {
  project: ProjectDocument | null | undefined;
  activeAnimationId?: string | null;
  timeMs: number;
  previewModifierDraft?: AnimationModifier | null;
}): ModifierPoseOverrides {
  if (!project) return new Map<string, Record<string, unknown>>();

  const result: ModifierPoseOverrides = new Map();
  const sortedModifiers: AnimationModifier[] = [];
  const allModifiers = [...(project.animationModifiers ?? [])];

  if (
    previewModifierDraft &&
    !allModifiers.some((m) => m.id === previewModifierDraft.id)
  ) {
    allModifiers.push(previewModifierDraft);
  }

  for (const modifier of allModifiers) {
    if (!isModifierActive(modifier, activeAnimationId)) continue;

    if (modifier.category !== "loop") continue;
    if (modifier.driver?.kind !== "time") continue;
    if (
      !modifier.driver?.periodMs ||
      !isFinite(modifier.driver.periodMs) ||
      modifier.driver.periodMs <= 0
    )
      continue;

    sortedModifiers.push(modifier);
  }

  sortedModifiers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const modifier of sortedModifiers) {
    if (modifier.driver.kind !== "time") continue;
    const driver01 = evaluateTimeDriver(modifier.driver, timeMs);

    for (const output of modifier.outputs ?? []) {
      const evaluator = outputEvaluators[output.kind];
      if (!evaluator) continue;
      const partial = evaluator(output, driver01, modifier, project);
      if (!partial) continue;

      for (const [targetId, overrides] of Object.entries(partial)) {
        const existing = result.get(targetId) ?? {};
        result.set(targetId, { ...existing, ...overrides });
      }
    }
  }

  return result;
}

export function evaluateBoneMotionDriver(
  driver: BoneMotionDriver | null | undefined,
  effectiveBones: readonly Bone[] | null | undefined,
  project: ProjectDocument,
  poseOverrides:
    ReadonlyMap<string, Record<string, unknown>> | null | undefined,
): number {
  if (!driver || driver.kind !== "boneMotion") return 0;

  const sourceBoneId = driver.sourceBoneId;
  if (!sourceBoneId) return 0;

  const currentBone = effectiveBones?.find((b) => b.id === sourceBoneId);
  const restBone = project.bones?.find((b) => b.id === sourceBoneId);
  if (!currentBone || !restBone) return 0;

  const axes = driver.axes ?? ["x", "y"];
  const gain = Number.isFinite(driver.gain) ? driver.gain : 1;
  const deadZone =
    typeof driver.deadZone === "number" && Number.isFinite(driver.deadZone)
      ? driver.deadZone
      : 0;

  let totalDisplacement = 0;
  for (const axis of axes) {
    const current = currentBone.setup[axis] ?? 0;
    const rest = restBone.setup[axis] ?? 0;
    totalDisplacement += Math.abs(current - rest);
  }
  const authoredOverride = poseOverrides?.get?.(sourceBoneId);
  if (authoredOverride) {
    for (const axis of axes) {
      const authoredValue = authoredOverride[axis];
      if (typeof authoredValue === "number" && Number.isFinite(authoredValue)) {
        const rest = restBone.setup[axis] ?? 0;
        totalDisplacement = Math.max(
          totalDisplacement,
          Math.abs(authoredValue - rest),
        );
      }
    }
  }

  if (!isFinite(totalDisplacement) || totalDisplacement < 0) return 0;
  if (totalDisplacement < deadZone) return 0;

  const curve = driver.curve ?? "linear";
  const signal =
    curve === "abs" ? Math.abs(totalDisplacement) : totalDisplacement;

  return signal * gain;
}

export function evaluateReactionModifiers({
  project,
  activeAnimationId,
  effectiveBones,
  poseOverrides,
}: {
  project: ProjectDocument | null | undefined;
  activeAnimationId?: string | null;
  effectiveBones?: readonly Bone[] | null;
  poseOverrides?: ReadonlyMap<string, Record<string, unknown>> | null;
}): ModifierPoseOverrides {
  if (!project) return new Map<string, Record<string, unknown>>();

  const result: ModifierPoseOverrides = new Map();
  const sortedModifiers: AnimationModifier[] = [];

  for (const modifier of project.animationModifiers ?? []) {
    if (!isModifierActive(modifier, activeAnimationId)) continue;
    if (modifier.category !== "reaction") continue;
    if (modifier.driver?.kind !== "boneMotion") continue;
    sortedModifiers.push(modifier);
  }

  sortedModifiers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const modifier of sortedModifiers) {
    if (modifier.driver.kind !== "boneMotion") continue;
    const signal = evaluateBoneMotionDriver(
      modifier.driver,
      effectiveBones,
      project,
      poseOverrides,
    );
    if (signal === 0) continue;

    for (const output of modifier.outputs ?? []) {
      const evaluator = outputEvaluators[output.kind];
      if (!evaluator) continue;
      const partial = evaluator(output, signal, modifier, project);
      if (!partial) continue;

      for (const [targetId, overrides] of Object.entries(partial)) {
        const existing = result.get(targetId) ?? {};
        result.set(targetId, { ...existing, ...overrides });
      }
    }
  }

  return result;
}

export function hasActiveTimeModifiers({
  project,
  activeAnimationId,
}: {
  project: ProjectDocument | null | undefined;
  activeAnimationId?: string | null;
}): boolean {
  if (!project?.animationModifiers?.length) return false;
  return project.animationModifiers.some((m) => {
    if (m.enabled === false || m.muted === true) return false;
    if (m.scope === "clip" && m.clipId !== activeAnimationId) return false;
    return m.category === "loop" && m.driver?.kind === "time";
  });
}
