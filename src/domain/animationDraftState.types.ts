import type { AnimationId, AnimationTargetId } from "@kukla2d/contracts";

type DraftChannelValue = unknown;
type DraftChannelMap = Map<
  AnimationTargetId,
  Record<string, DraftChannelValue>
>;

export interface AnimationDraft {
  context: { animationId: AnimationId; timeMs: number } | null;
  values: DraftChannelMap;
  dirty: boolean;
  revision: number;
}
