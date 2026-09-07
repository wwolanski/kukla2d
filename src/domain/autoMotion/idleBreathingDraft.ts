import type {
  AnimationModifier,
  BlendShape,
  ControlHandle,
  Mesh,
  PartNode,
  ProjectDocument,
} from "@kukla2d/contracts";

import { uid } from "@/lib/uid";

import { createControlHandle, computePartCenter } from "./controlHandles.js";
import { createIdleBreathingPresetDefinition } from "./idleBreathingPreset.js";
import {
  getPresetDefaultDriver,
  getPresetDefaultParams,
} from "./presetRegistry.js";

import type {
  AutoMotionDraftOptions,
  AutoMotionDraftResult,
  BoundingBox,
} from "./autoMotionTypes.types.js";

export function createIdleBreathingDraft({
  project,
  chestNodeId,
  options = {},
}: {
  project: ProjectDocument | null | undefined;
  chestNodeId: string;
  options?: AutoMotionDraftOptions;
}): AutoMotionDraftResult {
  if (!project) return { error: "No project provided" };
  if (!chestNodeId) return { error: "No chest node ID provided" };

  const chestPart = project.nodes.find(
    (node): node is PartNode => node.id === chestNodeId && node.type === "part",
  );
  if (!chestPart) return { error: `Chest part "${chestNodeId}" not found` };

  const meshVerts = chestPart.mesh?.vertices;
  if (!meshVerts || !Array.isArray(meshVerts) || meshVerts.length < 3) {
    return {
      error:
        "Idle Breathing requires a mesh with at least 3 vertices on the chest part",
    };
  }

  if (meshVerts.some((v) => !isFinite(v.x) || !isFinite(v.y))) {
    return {
      error: "Idle Breathing requires finite mesh vertices on the chest part",
    };
  }

  const preset = createIdleBreathingPresetDefinition();
  const driver = getPresetDefaultDriver(preset.presetId);
  if (!driver)
    return { error: `Driver for preset "${preset.presetId}" not found` };
  const params = {
    ...(getPresetDefaultParams(preset.presetId) ?? {}),
    ...(options.params ?? {}),
  };
  const strength = options.strength ?? params.strength ?? 1;

  const bbox = computeBBox(meshVerts);
  const center = computePartCenter(chestPart);

  const handles: ControlHandle[] = [];
  const blendShapes: BlendShape[] = [];

  const chestHandle = createControlHandle({
    name: `${chestPart.name} Chest`,
    role: "chest",
    space: "node-local",
    target: { kind: "part", id: chestNodeId },
    position: { x: center.x, y: center.y },
    radius: 10,
  });
  handles.push(chestHandle);

  const chestDx = (bbox.maxX - bbox.minX) * 0.02;
  const chestDy = (bbox.maxY - bbox.minY) * 0.01;

  const deltas = meshVerts.map((v) => ({
    dx: ((v.x - center.x) / (bbox.maxX - bbox.minX || 1)) * chestDx,
    dy: ((v.y - center.y) / (bbox.maxY - bbox.minY || 1)) * chestDy,
  }));

  const blendShapeId = uid();
  blendShapes.push({
    id: blendShapeId,
    name: "Breath In",
    deltas,
  });

  const outputs: AnimationModifier["outputs"] = [
    {
      kind: "meshDelta",
      targetId: chestNodeId,
      property: "idleBreathing",
      blendMode: "add",
    },
    {
      kind: "blendShapeValue",
      targetId: chestNodeId,
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
    driver: { ...driver },
    bindings: {
      chest: {
        role: "chest",
        required: true,
        target: "handle",
        weight: 1,
      },
    },
    outputs,
    params: {
      strength,
      chestExpandPx: params.chestExpandPx ?? 4,
      verticalLiftPx: params.verticalLiftPx ?? 16,
      limbFollowPx: params.limbFollowPx ?? 1,
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
