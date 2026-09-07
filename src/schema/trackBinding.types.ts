import type { TARGET_TYPES, VALUE_TYPES } from "./trackBinding.js";

export type ValueType = (typeof VALUE_TYPES)[keyof typeof VALUE_TYPES];

export type TargetType = (typeof TARGET_TYPES)[keyof typeof TARGET_TYPES];

export interface TrackBinding {
  targetType: string;
  targetId: string;
  property: string;
  valueType: string;
}

export interface TimedKeyframe {
  time: number;
}
