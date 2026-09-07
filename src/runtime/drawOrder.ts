import type { Slot, SlotId } from "@kukla2d/contracts";

interface DrawOrderOverride {
  drawOrder?: number;
}

export function evaluateDrawOrder(
  slots: readonly Slot[],
  overrides?: ReadonlyMap<SlotId, DrawOrderOverride> | null,
): SlotId[] {
  return slots
    .map((slot) => ({
      id: slot.id,
      drawOrder: overrides?.get(slot.id)?.drawOrder ?? slot.drawOrder ?? 0,
    }))
    .sort(
      (left, right) =>
        left.drawOrder - right.drawOrder || left.id.localeCompare(right.id),
    )
    .map((slot) => slot.id);
}
