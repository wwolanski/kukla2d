import { z } from "zod";

import type { EventKeyframe, EventValue } from "./eventSchema.types.js";

export const EventDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  intValue: z.number().optional(),
  floatValue: z.number().optional(),
  stringValue: z.string().optional(),
  audioRef: z.string().optional(),
});

export const EventKeyframeSchema = z.object({
  time: z.number().finite(),
  value: z.object({
    eventId: z.string().min(1),
    intValue: z.number().optional(),
    floatValue: z.number().optional(),
    stringValue: z.string().optional(),
    audioRef: z.string().optional(),
  }),
  easing: z.literal("step").default("step"),
});

export function checkEventCrossing(
  prevTime: number,
  currentTime: number,
  eventKeyframes: readonly EventKeyframe[],
): EventValue[] {
  const crossed: EventValue[] = [];
  for (const kf of eventKeyframes) {
    if (prevTime < kf.time && currentTime >= kf.time) {
      crossed.push(kf.value);
    } else if (prevTime > currentTime) {
      if (kf.time >= currentTime && kf.time < prevTime) {
        crossed.push(kf.value);
      }
      if (kf.time < currentTime) {
        crossed.push(kf.value);
      }
    }
  }
  return crossed;
}
