import type {
  AnimationModifier,
  BlendShape,
  ControlHandle,
  Mesh,
  PartNode,
  ProjectDocument,
} from "@kukla2d/contracts";

import { clampFiniteNumber } from "@/lib/math";
import { uid } from "@/lib/uid";

import { createControlHandle } from "./controlHandles.js";
import { createHeadCheekJigglePresetDefinition } from "./headCheekJigglePreset.js";
import {
  getPresetDefaultDriver,
  getPresetDefaultParams,
} from "./presetRegistry.js";

import type {
  AutoMotionDraftOptions,
  AutoMotionDraftResult,
  BoundingBox,
} from "./autoMotionTypes.types.js";

export function createHeadCheekJiggleDraft({
  project,
  sourceBoneId,
  faceNodeId,
  options = {},
}: {
  project: ProjectDocument | null | undefined;
  sourceBoneId: string;
  faceNodeId: string;
  options?: AutoMotionDraftOptions;
}): AutoMotionDraftResult {
  if (!project) return { error: "No project provided" };
  if (!sourceBoneId) return { error: "No source bone ID provided" };
  if (!faceNodeId) return { error: "No face node ID provided" };

  const sourceBone = (project.bones ?? []).find((b) => b.id === sourceBoneId);
  if (!sourceBone) return { error: `Source bone "${sourceBoneId}" not found` };

  const facePart = project.nodes.find(
    (node): node is PartNode => node.id === faceNodeId && node.type === "part",
  );
  if (!facePart) return { error: `Face part "${faceNodeId}" not found` };

  const meshVerts = facePart.mesh?.vertices;
  if (!meshVerts || !Array.isArray(meshVerts) || meshVerts.length < 3) {
    return {
      error:
        "Head Cheek Jiggle requires a mesh with at least 3 vertices on the face part",
    };
  }

  if (meshVerts.some((v) => !isFinite(v.x) || !isFinite(v.y))) {
    return {
      error: "Head Cheek Jiggle requires finite mesh vertices on the face part",
    };
  }

  const preset = createHeadCheekJigglePresetDefinition();
  const driver = getPresetDefaultDriver(preset.presetId);
  if (!driver || driver.kind !== "boneMotion")
    return {
      error: `Bone motion driver for preset "${preset.presetId}" not found`,
    };
  const params = {
    ...(getPresetDefaultParams(preset.presetId) ?? {}),
    ...(options.params ?? {}),
  };
  const strength = options.strength ?? params.strength ?? 0.5;
  const cheekRadius = clampFiniteNumber(
    options.cheekRadius ?? params.cheekRadius ?? 0.35,
    0.12,
    0.8,
  );

  const bbox = computeBBox(meshVerts);
  const bboxWidth = bbox.maxX - bbox.minX || 1;
  const bboxHeight = bbox.maxY - bbox.minY || 1;
  const cheekPoint = resolveCheekPoint({
    ...(options.cheekPoint === undefined ? {} : { point: options.cheekPoint }),
    params,
    bbox,
    bboxWidth,
    bboxHeight,
  });
  const cheekSide =
    cheekPoint.x < bbox.minX + bboxWidth * 0.45
      ? -1
      : cheekPoint.x > bbox.minX + bboxWidth * 0.55
        ? 1
        : 0;

  const handles: ControlHandle[] = [];

  const boneHandle = createControlHandle({
    name: `${sourceBone.name ?? "Bone"} Source`,
    role: "sourceBone",
    space: "canvas",
    target: { kind: "bone", id: sourceBoneId },
    position: { x: sourceBone.setup?.x ?? 0, y: sourceBone.setup?.y ?? 0 },
    radius: 8,
  });
  handles.push(boneHandle);

  const faceHandle = createControlHandle({
    name: `${facePart.name} Face`,
    role: "facePart",
    space: "node-local",
    target: { kind: "part", id: faceNodeId },
    position: {
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
    },
    radius: 12,
  });
  handles.push(faceHandle);

  const cheekHandle = createControlHandle({
    name: `${facePart.name} Cheek Area`,
    role: "cheekArea",
    space: "node-local",
    target: { kind: "part", id: faceNodeId },
    position: cheekPoint,
    radius: Math.max(8, Math.min(bboxWidth, bboxHeight) * cheekRadius),
  });
  handles.push(cheekHandle);

  const jigglePx = params.jigglePx ?? 3;
  const softness = params.softness ?? 0.3;

  const deltas = meshVerts.map((v) => {
    const dx = (v.x - cheekPoint.x) / bboxWidth;
    const dy = (v.y - cheekPoint.y) / bboxHeight;
    const radiusFalloff = Math.max(
      0,
      1 - Math.sqrt(dx * dx + dy * dy) / cheekRadius,
    );
    const falloff = Math.pow(radiusFalloff, 1 + softness * 2);

    const direction =
      cheekSide === 0 ? (v.x < cheekPoint.x ? -1 : 1) : cheekSide;
    const lateralSway = direction * jigglePx * falloff;
    const verticalBounce =
      Math.max(0, 1 - Math.abs(dy) / cheekRadius) * jigglePx * 0.35 * falloff;

    return {
      dx: lateralSway,
      dy: verticalBounce,
    };
  });

  const blendShapeId = uid();
  const blendShapes: BlendShape[] = [
    {
      id: blendShapeId,
      name: "Cheek Jiggle",
      deltas,
    },
  ];

  const outputs: AnimationModifier["outputs"] = [
    {
      kind: "meshDelta",
      targetId: faceNodeId,
      property: "cheekJiggle",
      blendMode: "add",
    },
    {
      kind: "blendShapeValue",
      targetId: faceNodeId,
      property: blendShapeId,
      blendMode: "add",
    },
  ];

  const modifier: AnimationModifier = {
    id: uid(),
    name: preset.name,
    presetId: preset.presetId,
    presetVersion: preset.presetVersion,
    enabled: true,
    order: 0,
    scope: "project",
    category: preset.category,
    driver: {
      ...driver,
      sourceBoneId,
      gain: options.gain ?? driver.gain,
      ...(options.deadZone === undefined && driver.deadZone === undefined
        ? {}
        : { deadZone: options.deadZone ?? driver.deadZone! }),
    },
    bindings: {
      sourceBone: {
        role: "sourceBone",
        required: true,
        target: "bone",
        weight: 1,
      },
      facePart: {
        role: "facePart",
        required: true,
        target: "part",
        weight: 1,
      },
      cheekArea: {
        role: "cheekArea",
        required: true,
        target: "handle",
        weight: 1,
      },
    },
    outputs,
    params: {
      strength,
      jigglePx: params.jigglePx ?? 3,
      softness: params.softness ?? 0.3,
      cheekSide,
      cheekPointX: cheekPoint.x,
      cheekPointY: cheekPoint.y,
      cheekRadius,
    },
  };

  return { handles, blendShapes, modifier };
}

function computeBBox(vertices: NonNullable<Mesh["vertices"]>): BoundingBox {
  if (!vertices?.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY };
}

function resolveCheekPoint({
  point,
  params,
  bbox,
  bboxWidth,
  bboxHeight,
}: {
  point?: { x: number; y: number };
  params: Record<string, number>;
  bbox: BoundingBox;
  bboxWidth: number;
  bboxHeight: number;
}): { x: number; y: number } {
  const explicitX = point?.x ?? params.cheekPointX;
  const explicitY = point?.y ?? params.cheekPointY;
  if (Number.isFinite(explicitX) && Number.isFinite(explicitY)) {
    return {
      x: clampFiniteNumber(explicitX, bbox.minX, bbox.maxX),
      y: clampFiniteNumber(explicitY, bbox.minY, bbox.maxY),
    };
  }
  const focusX = clampFiniteNumber(params.cheekFocusX ?? 0.68, 0, 1);
  const focusY = clampFiniteNumber(params.cheekFocusY ?? 0.58, 0, 1);
  return {
    x: bbox.minX + focusX * bboxWidth,
    y: bbox.minY + focusY * bboxHeight,
  };
}
