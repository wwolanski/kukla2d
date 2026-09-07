import { toAnimationTargetId } from "@kukla2d/contracts";
import type {
  Animation,
  AnimationTargetId,
  Keyframe,
  Track,
} from "@kukla2d/contracts";

import {
  checkBoomerangEligibility,
  getBoomerangCutoff,
} from "@/domain/animationBoomerang";
import {
  getTrackValueCategory,
  getAllAnimationPropertySpecs,
} from "@/domain/animationProperties";
import type {
  AnimationPropertySpec,
  TrackValueCategory,
} from "@/domain/animationProperties.types.js";
import { isTimelineVisibleKeyframe } from "@/domain/keyframeProvenance";

const EASING_DEFAULT = "ease-both" as const;

import type {
  TimelineTargetDescriptor,
  VisibleTimelineRow,
} from "./buildTimelineTrackRows.types.js";

type TimelineEasing = NonNullable<Keyframe["easing"]>;

interface TimelinePropertyRow {
  id: string;
  targetId: AnimationTargetId;
  property: string;
  valueCategory: TrackValueCategory | null;
  keyframes: Keyframe[];
  times: number[];
  easingByTime: Record<number, TimelineEasing>;
}

interface TimelineSemanticRow {
  id: string;
  targetId: AnimationTargetId;
  label: string;
  properties: string[];
  propertyRows: TimelinePropertyRow[];
  times: number[];
  easingByTime: Record<number, TimelineEasing>;
  semantic: boolean;
  property?: string;
  valueCategory?: TrackValueCategory | null;
  keyframes?: Keyframe[];
}

interface TimelineTargetRow {
  targetId: AnimationTargetId;
  name: string;
  kind: string | null;
  tracks: Track[];
  times: number[];
  easingByTime: Record<number, TimelineEasing>;
  propertyRows: TimelinePropertyRow[];
  semanticRows: TimelineSemanticRow[];
  boomerangCutoff: ReturnType<typeof getBoomerangCutoff>;
  boomerangEligibility: ReturnType<typeof checkBoomerangEligibility>;
}

const SEMANTIC_GROUPS = [
  { id: "position", label: "Position", properties: ["x", "y"] },
  { id: "scale", label: "Scale", properties: ["scaleX", "scaleY"] },
  { id: "ik-target", label: "IK Target", properties: ["targetX", "targetY"] },
] as const;

function trackTargetId(track: Track): AnimationTargetId {
  return track.targetId;
}

function buildPropertyRow(
  targetId: AnimationTargetId,
  track: Track,
): TimelinePropertyRow {
  const keyframes = [...track.keyframes]
    .filter(isTimelineVisibleKeyframe)
    .sort((a, b) => a.time - b.time);
  const times = keyframes.map((kf) => kf.time);
  const easingByTime: Record<number, TimelineEasing> = {};
  for (const kf of keyframes) {
    easingByTime[kf.time] = kf.easing || EASING_DEFAULT;
  }
  return {
    id: `${targetId}:${track.property}`,
    targetId,
    property: track.property,
    valueCategory: getTrackValueCategory(track.property),
    keyframes,
    times,
    easingByTime,
  };
}

function buildSemanticRows(
  targetId: AnimationTargetId,
  propertyRows: TimelinePropertyRow[],
): TimelineSemanticRow[] {
  const byProperty = new Map(propertyRows.map((row) => [row.property, row]));
  const consumed = new Set<string>();
  const rows: TimelineSemanticRow[] = [];

  for (const group of SEMANTIC_GROUPS) {
    const components = group.properties
      .map((property) => byProperty.get(property))
      .filter((row): row is TimelinePropertyRow => row !== undefined);
    if (components.length === 0) continue;
    components.forEach((row) => consumed.add(row.property));
    const times = [...new Set(components.flatMap((row) => row.times))].sort(
      (a, b) => a - b,
    );
    const easingByTime: Record<number, TimelineEasing> = {};
    for (const time of times) {
      const component = components.find(
        (row) => row.easingByTime[time] !== undefined,
      );
      easingByTime[time] = component?.easingByTime[time] ?? EASING_DEFAULT;
    }
    rows.push({
      id: `${targetId}:group:${group.id}`,
      targetId,
      label: group.label,
      properties: components.map((row) => row.property),
      propertyRows: components,
      times,
      easingByTime,
      semantic: true,
    });
  }

  for (const row of propertyRows) {
    if (consumed.has(row.property)) continue;
    rows.push({
      ...row,
      label: row.property,
      properties: [row.property],
      propertyRows: [row],
      semantic: false,
    });
  }
  return rows;
}

export function buildTimelineTrackRows(
  clip: Animation | null | undefined,
  targetDescriptors: readonly TimelineTargetDescriptor[],
): TimelineTargetRow[] {
  if (!clip) return [];

  const nameMap = new Map<string, string>();
  for (const desc of targetDescriptors) {
    nameMap.set(desc.id, desc.name);
  }

  const kindMap = new Map<string, string>();
  for (const desc of targetDescriptors) {
    if (desc.kind) kindMap.set(desc.id, desc.kind);
  }

  const byTarget = new Map<string, Track[]>();

  for (const track of clip.tracks) {
    const targetId = trackTargetId(track);
    if (!targetId) continue;
    const tracks = byTarget.get(targetId) ?? [];
    tracks.push(track);
    byTarget.set(targetId, tracks);
  }

  return Array.from(byTarget.entries())
    .map(([targetId, tracks]) => {
      const visibleKeyframeTimes = new Set(
        tracks.flatMap((t) =>
          t.keyframes.filter(isTimelineVisibleKeyframe).map((kf) => kf.time),
        ),
      );
      if (visibleKeyframeTimes.size === 0) return null;

      const times = [...visibleKeyframeTimes].sort((a, b) => a - b);

      const easingByTime: Record<number, TimelineEasing> = {};
      for (const time of times) {
        for (const t of tracks) {
          const kf = t.keyframes.find(
            (k) => k.time === time && isTimelineVisibleKeyframe(k),
          );
          if (kf) {
            easingByTime[time] = kf.easing || EASING_DEFAULT;
            break;
          }
        }
      }

      const propertyRows = tracks
        .filter(
          (t) => t.property && t.keyframes.some(isTimelineVisibleKeyframe),
        )
        .map((t) => buildPropertyRow(toAnimationTargetId(targetId), t));

      if (propertyRows.length === 0) return null;

      const semanticRows = buildSemanticRows(
        toAnimationTargetId(targetId),
        propertyRows,
      );

      const boomerangCutoff = getBoomerangCutoff(
        clip,
        toAnimationTargetId(targetId),
      );
      const boomerangEligibility = checkBoomerangEligibility(
        clip,
        toAnimationTargetId(targetId),
      );

      return {
        targetId,
        name: nameMap.get(targetId) ?? targetId,
        kind: kindMap.get(targetId) ?? null,
        tracks,
        times,
        easingByTime,
        propertyRows,
        semanticRows,
        boomerangCutoff,
        boomerangEligibility,
      };
    })
    .filter((row): row is TimelineTargetRow => row !== null);
}

export function getAuthorablePropertiesForTarget(
  targetKind: string,
): AnimationPropertySpec[] {
  const specs = getAllAnimationPropertySpecs();
  return specs.filter(
    (spec) => spec.authorable && spec.targetKinds.includes(targetKind),
  );
}

export function getMissingProperties(
  targetKind: string,
  existingProperties: readonly string[],
): AnimationPropertySpec[] {
  const authorable = getAuthorablePropertiesForTarget(targetKind);
  const existing = new Set(existingProperties);
  return authorable.filter((spec) => !existing.has(spec.property));
}

export function flattenVisibleRows(
  trackRows: readonly TimelineTargetRow[],
  expandedSet: ReadonlySet<string>,
): VisibleTimelineRow[] {
  const result: VisibleTimelineRow[] = [];
  for (const row of trackRows) {
    result.push({ type: "target", row });
    if (expandedSet.has(row.targetId)) {
      for (const propRow of row.semanticRows) {
        result.push({ type: "property", row: propRow, parentRow: row });
      }
    }
  }
  return result;
}
