import { useEffect } from "react";

import type { ProjectDocument } from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import type { AnimationStore } from "@/store/animationStoreTypes.types.js";
import { useEditorStore } from "@/store/editorStore";
import type { EditorStore } from "@/store/editorStoreTypes.types.js";
import { useProjectStore } from "@/store/projectStore";

import { FRAME_RELEVANT_EDITOR_FIELDS } from "@/features/canvas/domain/frameEditorFields.js";
import type { EditorWorkflowState } from "@/features/canvas/domain/workflowContracts.types.js";

import type {
  CanvasEditorSnapshot,
  MutableRef,
} from "./canvasApplication.types.js";
import type { editorWorkflowMachine } from "./editorWorkflowMachine.js";
import type { ActorRefFrom } from "xstate";

type WorkflowActorRef = ActorRefFrom<typeof editorWorkflowMachine>;

interface CanvasFrameSubscriptionRefs {
  projectRef: MutableRef<ProjectDocument>;
  editorRef: MutableRef<CanvasEditorSnapshot>;
  animationRef: MutableRef<AnimationStore>;
  workflowActorRef: WorkflowActorRef;
  markDirty: () => void;
}

const WORKFLOW_FRAME_FIELDS = [
  "activeTool",
  "selectionTarget",
  "riggingMode",
  "riggingTool",
  "toolMode",
  "meshEditMode",
  "meshSubMode",
  "weightPaintMode",
] as const satisfies readonly (keyof EditorWorkflowState)[];

const ANIMATION_FRAME_FIELDS = [
  "activeAnimationId",
  "currentTime",
  "endFrame",
  "fps",
  "loopKeyframes",
  "draftPose",
] as const satisfies readonly (keyof AnimationStore)[];

export const didFrameEditorStateChange = (
  prev: EditorStore,
  next: EditorStore,
): boolean =>
  (FRAME_RELEVANT_EDITOR_FIELDS as readonly (keyof EditorStore)[]).some(
    (field) => next[field] !== prev[field],
  );

export const didWorkflowFrameStateChange = (
  prev: EditorWorkflowState,
  next: EditorWorkflowState,
): boolean =>
  WORKFLOW_FRAME_FIELDS.some((field) => next[field] !== prev[field]);

export const didAnimationFrameStateChange = (
  prev: AnimationStore,
  next: AnimationStore,
): boolean =>
  ANIMATION_FRAME_FIELDS.some((field) => next[field] !== prev[field]);

export function createCanvasFrameSubscriptions({
  projectRef,
  editorRef,
  animationRef,
  workflowActorRef,
  markDirty,
}: CanvasFrameSubscriptionRefs): () => void {
  let prevEditor = useEditorStore.getState();
  let prevWorkflow = workflowActorRef.getSnapshot().context;
  let prevAnimation = useAnimationStore.getState();

  const unsubProject = useProjectStore.subscribe((state) => {
    if (state.project !== projectRef.current) {
      projectRef.current = state.project;
      markDirty();
    }
  });

  const unsubEditor = useEditorStore.subscribe((state) => {
    editorRef.current = {
      ...state,
      ...workflowActorRef.getSnapshot().context,
    };
    if (didFrameEditorStateChange(prevEditor, state)) markDirty();
    prevEditor = state;
  });

  const workflowSubscription = workflowActorRef.subscribe((snapshot) => {
    const context = snapshot.context;
    editorRef.current = {
      ...useEditorStore.getState(),
      ...context,
    };
    if (didWorkflowFrameStateChange(prevWorkflow, context)) markDirty();
    prevWorkflow = context;
  });

  const unsubAnimation = useAnimationStore.subscribe((state) => {
    animationRef.current = state;
    if (didAnimationFrameStateChange(prevAnimation, state)) markDirty();
    prevAnimation = state;
  });

  return () => {
    unsubProject();
    unsubEditor();
    workflowSubscription.unsubscribe();
    unsubAnimation();
  };
}

export function useCanvasFrameSubscriptions(
  args: CanvasFrameSubscriptionRefs,
): void {
  const { projectRef, editorRef, animationRef, workflowActorRef, markDirty } =
    args;
  useEffect(
    () =>
      createCanvasFrameSubscriptions({
        projectRef,
        editorRef,
        animationRef,
        workflowActorRef,
        markDirty,
      }),
    [projectRef, editorRef, animationRef, workflowActorRef, markDirty],
  );
}
