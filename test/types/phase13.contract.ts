import type { MoveAnimationKeyframesPayload } from "@/domain/animationCommandTypes.types.js";
import type { ProjectCommandResult } from "@/store/project/projectStoreTypes.types.js";
import type { TimelineCommandApi } from "@/features/timeline/application/createTimelineCommandApi.types.js";
import type {
  DragSession,
  DragSourceKind,
  DragTargetKind,
  DropPosition,
} from "@/features/layers/domain/dragSession.types.js";
import type { validateRename } from "@/features/layers/domain/inlineRename";
import type { resolveEffectiveInspectorTarget } from "@/features/inspector/application/useEffectiveInspectorTarget";

type RenameValidationResult = ReturnType<typeof validateRename>;

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type TimelineMoveInput = Expect<
  Equal<
    Parameters<TimelineCommandApi["moveAnimationKeyframes"]>[0],
    MoveAnimationKeyframesPayload
  >
>;

type TimelineMoveResult = Expect<
  Equal<
    ReturnType<TimelineCommandApi["moveAnimationKeyframes"]>,
    ProjectCommandResult
  >
>;

const dragSession = {
  sourceKind: "node",
  sourceId: "node-1",
  targetKind: "bone",
  targetId: "bone-1",
  dropPosition: "inside",
} satisfies DragSession;

type DragSourceContract = Expect<Equal<typeof dragSession.sourceKind, "node">>;
type DragSourceKinds = Expect<
  Equal<Extract<DragSourceKind, "node" | "bone">, "node" | "bone">
>;
type DragTargetKinds = Expect<
  Equal<Extract<DragTargetKind, "root" | "folder">, "root" | "folder">
>;
type DropPositions = Expect<Equal<DropPosition, "before" | "after" | "inside">>;

type EffectiveInspectorTarget = ReturnType<
  typeof resolveEffectiveInspectorTarget
>;

function readRenameResult(result: RenameValidationResult): string {
  return result.valid ? result.value : result.reason;
}

function readInspectorMode(
  result: EffectiveInspectorTarget,
): EffectiveInspectorTarget["mode"] {
  return result.mode;
}

void dragSession;
void readRenameResult;
void readInspectorMode;
export type {
  DragSourceContract,
  DragSourceKinds,
  DragTargetKinds,
  DropPositions,
  TimelineMoveInput,
  TimelineMoveResult,
};
