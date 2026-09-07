import type { AnimationTargetId, Keyframe, Track } from "@kukla2d/contracts";

import type {
  checkBoomerangEligibility,
  getBoomerangCutoff,
} from "@/domain/animationBoomerang";
import type { TrackValueCategory } from "@/domain/animationProperties.types.js";

export interface TimelineTargetDescriptor {
  id: AnimationTargetId;
  name: string;
  kind?: string | null;
}

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

export type VisibleTimelineRow =
  | { type: "target"; row: TimelineTargetRow }
  | {
      type: "property";
      row: TimelineSemanticRow;
      parentRow: TimelineTargetRow;
    };
