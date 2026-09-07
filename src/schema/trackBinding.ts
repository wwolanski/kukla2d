import type { TimedKeyframe, TrackBinding } from "./trackBinding.types.js";

export const VALUE_TYPES = {
  SCALAR: "scalar",
  ANGLE: "angle",
  VEC2: "vec2",
  COLOR: "color",
  BOOLEAN: "boolean",
  VERTEX_ARRAY: "vertexArray",
  ATTACHMENT_REF: "attachmentRef",
  DRAW_ORDER: "drawOrder",
  EVENT: "event",
} as const;

export const TARGET_TYPES = {
  BONE: "bone",
  SLOT: "slot",
  NODE: "node",
  SKIN: "skin",
} as const;

export function createTrackBinding(
  targetType: string,
  targetId: string,
  property: string,
  valueType: string,
): TrackBinding {
  return { targetType, targetId, property, valueType };
}

export function validateKeyframeValue(
  value: unknown,
  valueType: string,
): boolean {
  switch (valueType) {
    case VALUE_TYPES.SCALAR:
    case VALUE_TYPES.ANGLE:
      return typeof value === "number" && Number.isFinite(value);
    case VALUE_TYPES.VEC2: {
      if (typeof value !== "object" || value === null) return false;
      const rec = value as Record<string, unknown>;
      return typeof rec.x === "number" && typeof rec.y === "number";
    }
    case VALUE_TYPES.COLOR:
      return typeof value === "string" && /^#?[0-9a-fA-F]{6,8}$/.test(value);
    case VALUE_TYPES.BOOLEAN:
      return typeof value === "boolean";
    case VALUE_TYPES.VERTEX_ARRAY:
      if (!Array.isArray(value)) return false;
      return value.every((v) => {
        if (typeof v !== "object" || v === null) return false;
        const rec = v as Record<string, unknown>;
        return typeof rec.x === "number" && typeof rec.y === "number";
      });
    case VALUE_TYPES.ATTACHMENT_REF:
      return typeof value === "string" || value === null;
    case VALUE_TYPES.DRAW_ORDER:
      return typeof value === "number" && Number.isFinite(value);
    case VALUE_TYPES.EVENT:
      return typeof value === "object" && value !== null;
    default:
      return true;
  }
}

export function isDiscreteType(valueType: string): boolean {
  return (
    valueType === VALUE_TYPES.BOOLEAN ||
    valueType === VALUE_TYPES.ATTACHMENT_REF ||
    valueType === VALUE_TYPES.EVENT
  );
}

export function deduplicateKeyframes<T extends TimedKeyframe>(
  keyframes: T[],
): T[] {
  const byTime = new Map<number, T>();
  for (const kf of keyframes) {
    const existing = byTime.get(kf.time);
    if (!existing || kf.time >= existing.time) {
      byTime.set(kf.time, kf);
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}
