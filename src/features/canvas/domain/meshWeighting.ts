import type { BoneId, Mesh, VertexInfluence } from "@kukla2d/contracts";

import { finiteNumberOr } from "@/lib/math";

import { normalizeVertexInfluences, brushWeight } from "./meshEditing.js";

import type { MeshWeightStats } from "./meshWeighting.types.js";

export const WEIGHT_PAINT_MODES = [
  "add",
  "subtract",
  "replace",
  "smooth",
] as const;
type WeightPaintMode = (typeof WEIGHT_PAINT_MODES)[number];
interface Point {
  x: number;
  y: number;
}
interface BoneSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface WeightBrushSettings {
  mode?: WeightPaintMode;
  strength?: number;
  targetWeight?: number;
}

export function clampWeight(value: unknown, fallback = 0): number {
  const number = finiteNumberOr(value, fallback);
  return Math.max(0, Math.min(1, number));
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
  const sx = x1 + t * dx;
  const sy = y1 + t * dy;
  return Math.hypot(px - sx, py - sy);
}

export function ensureMeshInfluenceSlots(mesh: Mesh | null | undefined): void {
  if (!mesh?.vertices?.length) return;
  const vertexCount = mesh.vertices.length;
  if (
    !Array.isArray(mesh.influences) ||
    mesh.influences.length !== vertexCount
  ) {
    mesh.influences = Array.from({ length: vertexCount }, () => []);
  }
}

export function normalizeMeshInfluences(
  influences: readonly (readonly VertexInfluence[])[] | null | undefined,
  vertexCount: number,
): VertexInfluence[][] {
  const slots: VertexInfluence[][] = Array.from(
    { length: vertexCount },
    () => [],
  );
  if (!influences) return slots;
  for (let i = 0; i < Math.min(influences.length, vertexCount); i++) {
    slots[i] = normalizeVertexInfluences(influences[i] ?? []);
  }
  return slots;
}

export function getVertexWeight(
  list: readonly VertexInfluence[] | null | undefined,
  boneId: BoneId,
): number {
  if (!list) return 0;
  return list.find((inf) => inf.boneId === boneId)?.weight ?? 0;
}

function pruneInfluences(
  influences: readonly VertexInfluence[],
): VertexInfluence[] {
  return influences
    .filter((inf) => inf?.boneId && inf.weight > 0.0001)
    .map((inf) => ({ boneId: inf.boneId, weight: clampWeight(inf.weight) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
}

function setSelectedBoneWeight(
  list: readonly VertexInfluence[],
  boneId: BoneId,
  desiredWeight: number,
): VertexInfluence[] {
  const desired = clampWeight(desiredWeight);
  if (desired <= 0.0001) {
    return normalizeVertexInfluences(
      (list ?? []).filter((inf) => inf?.boneId !== boneId),
    );
  }

  const others = pruneInfluences(
    (list ?? []).filter((inf) => inf?.boneId !== boneId),
  );
  if (others.length === 0) {
    return [{ boneId, weight: desired }];
  }

  const otherTotal = others.reduce((sum, inf) => sum + inf.weight, 0);
  if (otherTotal <= 0.0001) {
    return [{ boneId, weight: desired }];
  }

  const otherScale = (1 - desired) / otherTotal;
  return normalizeVertexInfluences([
    { boneId, weight: desired },
    ...others.map((inf) => ({
      boneId: inf.boneId,
      weight: inf.weight * otherScale,
    })),
  ]);
}

export function bindMeshToBone(
  mesh: Mesh | null | undefined,
  boneId: BoneId,
): void {
  if (!mesh?.vertices?.length || !boneId) return;
  ensureMeshInfluenceSlots(mesh);
  const next = mesh.vertices.map(() => [{ boneId, weight: 1 }]);
  mesh.influences = normalizeMeshInfluences(next, mesh.vertices.length);
}

export function bindUnweightedVerticesToBone(
  mesh: Mesh | null | undefined,
  boneId: BoneId,
): void {
  if (!mesh?.vertices?.length || !boneId) return;
  ensureMeshInfluenceSlots(mesh);
  mesh.influences = mesh.influences!.map((list) => {
    const normalized = normalizeVertexInfluences(list ?? []);
    return normalized.length > 0 ? normalized : [{ boneId, weight: 1 }];
  });
}

export function unbindMeshFromBone(
  mesh: Mesh | null | undefined,
  boneId: BoneId,
): void {
  if (!mesh?.influences?.length) return;
  const next = mesh.influences.map((list) =>
    (list ?? []).filter((inf) => inf?.boneId !== boneId),
  );
  mesh.influences = normalizeMeshInfluences(next, mesh.vertices.length);
}

export function applyAutoMeshWeights({
  mesh,
  boneIds,
  getBoneSegment,
  falloff = 40,
  vertexToWorld,
}: {
  mesh: Mesh | null | undefined;
  boneIds: readonly BoneId[];
  getBoneSegment: (boneId: BoneId) => BoneSegment | null | undefined;
  falloff?: number;
  vertexToWorld?: (x: number, y: number) => Point;
}):
  | { changed: false; reason: "no-mesh" | "no-bones" | "no-segments" }
  | { changed: true; boneCount: number } {
  if (!mesh?.vertices?.length) return { changed: false, reason: "no-mesh" };
  if (!boneIds?.length) return { changed: false, reason: "no-bones" };
  const safeFalloff = Number.isFinite(falloff) && falloff > 0 ? falloff : 40;
  const uniqueBoneIds = [...new Set(boneIds.filter(Boolean))];

  const segments = uniqueBoneIds
    .map((id) => {
      const seg = getBoneSegment(id);
      if (!seg) return null;
      return { boneId: id, seg };
    })
    .filter(
      (entry): entry is { boneId: BoneId; seg: BoneSegment } => entry !== null,
    );

  if (segments.length === 0) return { changed: false, reason: "no-segments" };

  ensureMeshInfluenceSlots(mesh);

  mesh.influences = mesh.vertices.map((v) => {
    const lx =
      typeof v.restX === "number" && Number.isFinite(v.restX) ? v.restX : v.x;
    const ly =
      typeof v.restY === "number" && Number.isFinite(v.restY) ? v.restY : v.y;
    const point =
      typeof vertexToWorld === "function"
        ? vertexToWorld(lx, ly)
        : { x: lx, y: ly };
    const distances = segments.map(({ boneId, seg }) => ({
      boneId,
      distance: distanceToSegment(
        point.x,
        point.y,
        seg.x1,
        seg.y1,
        seg.x2,
        seg.y2,
      ),
    }));
    const nearestDistance = Math.min(...distances.map((item) => item.distance));
    const list = distances.map(({ boneId, distance }) => {
      const relativeDistance = distance - nearestDistance;
      if (relativeDistance >= safeFalloff) return { boneId, weight: 0 };
      const proximity = 1 - relativeDistance / safeFalloff;
      return { boneId, weight: proximity * proximity };
    });
    return normalizeMeshInfluences([list], 1)[0]!;
  });
  return { changed: true, boneCount: segments.length };
}

export function computeMeshWeightStats(
  mesh: Mesh | null | undefined,
  selectedBoneId?: BoneId | null,
): MeshWeightStats {
  const vertexCount = mesh?.vertices?.length ?? 0;
  if (vertexCount === 0) {
    return {
      vertexCount: 0,
      boundVertexCount: 0,
      unboundVertexCount: 0,
      boneCount: 0,
      selectedBoneVertexCount: 0,
      minWeight: 0,
      maxWeight: 0,
      averageWeight: 0,
    };
  }

  const influences = mesh?.influences ?? [];
  let boundVertexCount = 0;
  let selectedBoneVertexCount = 0;
  const allBones = new Set<BoneId>();
  let minWeight = 1;
  let maxWeight = 0;
  let totalWeight = 0;

  for (let i = 0; i < vertexCount; i++) {
    const list = influences[i] ?? [];
    if (list.length > 0) {
      boundVertexCount++;
      for (const inf of list) {
        if (inf?.weight > 0) {
          allBones.add(inf.boneId);
          if (inf.weight < minWeight) minWeight = inf.weight;
          if (inf.weight > maxWeight) maxWeight = inf.weight;
          totalWeight += inf.weight;
        }
      }
    }
    if (
      selectedBoneId &&
      list.some((inf) => inf?.boneId === selectedBoneId && inf.weight > 0)
    ) {
      selectedBoneVertexCount++;
    }
  }

  const unboundVertexCount = vertexCount - boundVertexCount;

  return {
    vertexCount,
    boundVertexCount,
    unboundVertexCount,
    boneCount: allBones.size,
    selectedBoneVertexCount,
    minWeight: boundVertexCount > 0 ? minWeight : 0,
    maxWeight,
    averageWeight: boundVertexCount > 0 ? totalWeight / boundVertexCount : 0,
  };
}

export function applyWeightBrush({
  mesh,
  boneId,
  localX,
  localY,
  radius,
  hardness,
  settings,
}: {
  mesh: Mesh | null | undefined;
  boneId: BoneId;
  localX: number;
  localY: number;
  radius: number;
  hardness: number;
  settings?: WeightBrushSettings;
}): void {
  if (!mesh?.vertices?.length || !boneId) return;
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return;
  if (!Number.isFinite(radius) || radius <= 0) return;
  const vertexCount = mesh.vertices.length;
  ensureMeshInfluenceSlots(mesh);

  const mode: WeightPaintMode =
    settings?.mode && WEIGHT_PAINT_MODES.includes(settings.mode)
      ? settings.mode
      : "add";
  const strength = clampWeight(settings?.strength, 1);
  const targetWeight = clampWeight(settings?.targetWeight, 1);
  const safeHardness = clampWeight(hardness, 0);
  const influenceSnapshot = mesh.influences!.map((list) =>
    (list ?? []).map((inf) => ({ ...inf })),
  );

  for (let i = 0; i < vertexCount; i++) {
    const vertex = mesh.vertices[i]!;
    const dist = Math.hypot(vertex.x - localX, vertex.y - localY);
    const falloff = brushWeight(dist, radius, safeHardness);
    if (falloff <= 0) continue;

    const existingList = influenceSnapshot[i] ?? [];
    const existing = getVertexWeight(existingList, boneId);

    let nextWeight: number;

    switch (mode) {
      case "add":
        nextWeight = existing + strength * falloff * (1 - existing);
        break;
      case "subtract":
        nextWeight = existing - strength * falloff;
        break;
      case "replace":
        nextWeight = existing + (targetWeight - existing) * falloff * strength;
        break;
      case "smooth": {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < vertexCount; j++) {
          const candidate = mesh.vertices[j]!;
          const dj = Math.hypot(candidate.x - localX, candidate.y - localY);
          if (dj <= radius) {
            sum += getVertexWeight(influenceSnapshot[j], boneId);
            count++;
          }
        }
        const avg = count > 0 ? sum / count : 0;
        nextWeight = existing + (avg - existing) * falloff * strength;
        break;
      }
      default:
        nextWeight = existing;
    }

    nextWeight = clampWeight(nextWeight);
    mesh.influences![i] = setSelectedBoneWeight(
      existingList,
      boneId,
      nextWeight,
    );
  }
}
