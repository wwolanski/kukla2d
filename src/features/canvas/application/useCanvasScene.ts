import { useCallback, useRef, useState } from "react";

import type { ProjectDocument } from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";
import type { EditorActions } from "@/store/editorStoreTypes.types.js";
import type { ProjectActions } from "@/store/project/projectStoreTypes.types.js";

import { getPreviewModifierDraft } from "@/features/auto-motion";
import { buildCanvasFrame } from "@/features/canvas/domain/canvasFrame.js";

import { useCanvasSceneLifecycle } from "./canvasSceneLifecycle.js";
import { composeCanvasFrameState } from "./composeCanvasFrameState.js";
import { createCanvasAuthoringAdapter } from "./createCanvasAuthoringAdapter.js";
import { withTransientPose } from "./poseHelpers.js";
import { createPosePhysicsLoader } from "./posePhysicsLoader.js";
import { syncEffectiveMeshFrames } from "./syncEffectiveMeshFrames.js";
import { useCanvasFrameSubscriptions } from "./useCanvasFrameSubscriptions.js";

import type {
  CanvasEditorSnapshot,
  CanvasFrameRenderOptions,
  CanvasRuntimeDependencies,
  CanvasSceneGateway,
} from "./canvasApplication.types.js";
import type { CanvasAuthoringAdapter } from "./createCanvasAuthoringAdapter.types.js";
import type { editorWorkflowMachine } from "./editorWorkflowMachine.js";
import type { PhysicsRuntime } from "./evaluateEditorFramePose.types.js";
import type { CanvasFailure } from "../domain/canvasFailureCodes.types.js";
import type { RefObject } from "react";
import type { ActorRefFrom } from "xstate";

interface CanvasSceneOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  projectRef: RefObject<ProjectDocument>;
  editorRef: RefObject<CanvasEditorSnapshot>;
  animationRef: RefObject<AnimationStore>;
  isDarkRef: RefObject<boolean>;
  setView: EditorActions["setView"];
  setSelection: EditorActions["setSelection"];
  updateProject: ProjectActions["updateProject"];
  imageDataByPartId: Map<string, ImageData>;
  workflowActorRef: ActorRefFrom<typeof editorWorkflowMachine>;
  createRenderer: CanvasRuntimeDependencies["createRenderer"];
}

interface CanvasSceneController {
  sceneGatewayRef: RefObject<CanvasSceneGateway | null>;
  isDirtyRef: RefObject<boolean>;
  meshOverriddenPartsRef: RefObject<Set<string>>;
  markDirty: () => void;
  centerView: (contentWidth: number, contentHeight: number) => void;
  captureFrame: (options?: CanvasFrameRenderOptions) => void;
  rafRef: RefObject<number | null>;
  canvasFailure: CanvasFailure | null;
  retryCanvas: () => void;
}

export function useCanvasScene(
  options: CanvasSceneOptions,
): CanvasSceneController {
  const {
    canvasRef,
    projectRef,
    editorRef,
    animationRef,
    isDarkRef,
    setView,
    setSelection,
    updateProject,
    imageDataByPartId,
    workflowActorRef,
    createRenderer,
  } = options;
  const [canvasFailure, setCanvasFailure] = useState<CanvasFailure | null>(
    null,
  );
  const [generation, setGeneration] = useState(0);
  const sceneGatewayRef = useRef<CanvasSceneGateway | null>(null);
  const isDirtyRef = useRef(true);
  const meshOverriddenPartsRef = useRef(new Set<string>());
  const rafRef = useRef<number | null>(null);
  const posePhysicsRef = useRef<PhysicsRuntime | null>(null);
  const posePhysicsLoaderRef = useRef(createPosePhysicsLoader());
  const generationRef = useRef(0);
  const authoringAdapterRef = useRef<CanvasAuthoringAdapter | null>(
    createCanvasAuthoringAdapter(),
  );
  const markDirty = useCallback((): void => {
    isDirtyRef.current = true;
  }, []);
  const retryCanvas = useCallback((): void => {
    setCanvasFailure(null);
    setGeneration((value) => {
      generationRef.current = value + 1;
      return value + 1;
    });
  }, []);
  useCanvasFrameSubscriptions({
    projectRef,
    editorRef,
    animationRef,
    workflowActorRef,
    markDirty,
  });
  const centerView = useCallback(
    (contentWidth: number, contentHeight: number): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const zoom =
        Math.min(
          canvas.clientWidth / contentWidth,
          canvas.clientHeight / contentHeight,
        ) * 0.95;
      setView({
        zoom,
        panX: (canvas.clientWidth - contentWidth * zoom) / 2,
        panY: (canvas.clientHeight - contentHeight * zoom) / 2,
      });
      markDirty();
    },
    [canvasRef, markDirty, setView],
  );
  const captureFrame = useCallback(
    (frameOptions: CanvasFrameRenderOptions = {}): void => {
      const gateway = sceneGatewayRef.current;
      if (!gateway) return;
      const baseEditor = frameOptions.editorStateOverride ?? editorRef.current;
      const editor = {
        ...baseEditor,
        editorMode: frameOptions.exportMode
          ? "animation"
          : baseEditor.editorMode,
        view: frameOptions.viewOverride ?? baseEditor.view,
      };
      const animationState =
        frameOptions.animationStateOverride ?? animationRef.current;
      const transientPose =
        (frameOptions.includeTransientPose ??
        !frameOptions.animationStateOverride)
          ? gateway.interactionSystem?.readPreviewPoseOverrides()
          : null;
      const frameAnimationState = withTransientPose(
        animationState,
        transientPose,
      );
      const { poseOverrides, effectiveNodes, effectiveMeshes } =
        composeCanvasFrameState({
          project: projectRef.current,
          editorState: editor,
          animationState: frameAnimationState,
          physicsRuntime: posePhysicsRef.current?.evaluate
            ? posePhysicsRef.current
            : null,
          timestamp: 0,
          previewModifierDraft: getPreviewModifierDraft(),
        });
      meshOverriddenPartsRef.current = syncEffectiveMeshFrames({
        gateway,
        project: projectRef.current,
        effectiveMeshes,
        previousIds: meshOverriddenPartsRef.current,
      });
      const canvas = canvasRef.current;
      gateway.drawFrame(
        buildCanvasFrame({
          project: projectRef.current,
          editor,
          isDark: isDarkRef.current ?? true,
          poseOverrides,
          effectiveNodes,
          canvasSize: {
            width: canvas?.width ?? 0,
            height: canvas?.height ?? 0,
          },
          options: { ...frameOptions },
        }),
      );
    },
    [animationRef, canvasRef, editorRef, isDarkRef, projectRef],
  );
  useCanvasSceneLifecycle({
    canvasRef,
    projectRef,
    editorRef,
    animationRef,
    isDarkRef,
    setView,
    setSelection,
    updateProject,
    imageDataByPartId,
    workflowActorRef,
    generation,
    generationRef,
    sceneGatewayRef,
    isDirtyRef,
    meshOverriddenPartsRef,
    rafRef,
    posePhysicsRef,
    posePhysicsLoaderRef,
    authoringAdapterRef,
    markDirty,
    setCanvasFailure,
    createRenderer,
  });
  return {
    sceneGatewayRef,
    isDirtyRef,
    meshOverriddenPartsRef,
    markDirty,
    centerView,
    captureFrame,
    rafRef,
    canvasFailure,
    retryCanvas,
  };
}
