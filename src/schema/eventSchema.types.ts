import type {
  EventDefinitionSchema,
  EventKeyframeSchema,
} from "@/schema/eventSchema.js";
import type { z } from "zod";

export type EventDefinition = z.output<typeof EventDefinitionSchema>;

export type EventKeyframe = z.output<typeof EventKeyframeSchema>;

export type EventValue = EventKeyframe["value"];
