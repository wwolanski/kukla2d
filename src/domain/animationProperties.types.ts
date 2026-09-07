import type { TRACK_VALUE_CATEGORIES } from "./animationProperties.js";

export type TrackValueCategory =
  (typeof TRACK_VALUE_CATEGORIES)[keyof typeof TRACK_VALUE_CATEGORIES];
export type AnimationTargetKind = "node" | "bone" | "constraint" | "slot";

export interface AnimationPropertySpec {
  property: string;
  targetKinds: readonly string[];
  valueCategory: TrackValueCategory;
  interpolation: "none" | "linear" | "cubic";
  authorable: boolean;
  rendered: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
}
