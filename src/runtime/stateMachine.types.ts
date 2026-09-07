import type { AnimationId } from "@kukla2d/contracts";

export interface StateMachineState {
  id: string;
  name?: string;
  clipId?: AnimationId;
  loop?: boolean;
}

interface TransitionBase {
  id: string;
  fromStateId: string;
  toStateId: string;
  duration?: number;
  easing?: string;
}

export type StateMachineTransition =
  | (TransitionBase & { condition: "exitTime"; exitTime?: number })
  | (TransitionBase & {
      condition: "parameter";
      paramName: string;
      comparison: "greater" | "less" | "equals";
      threshold?: number;
    })
  | (TransitionBase & { condition?: "always" });
