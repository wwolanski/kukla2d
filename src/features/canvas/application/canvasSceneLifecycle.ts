import { useEffect } from "react";

import type { ProjectDocument } from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";
import type { EditorActions } from "@/store/editorStoreTypes.types.js";
import type { ProjectActions } from "@/store/project/projectStoreTypes.types.js";

import { createCanvasCommandExecutor } from "@/features/canvas/application/createCanvasCommandExecutor.js";
import {
  CANVAS_FAILURE_CODES,
  CANVAS_FAILURE_MESSAGES,
} from "@/features/canvas/domain/canvasFailureCodes.js";

import { renderCanvasSceneFrame } from "./renderCanvasSceneFrame.js";

import type {
  CanvasEditorSnapshot,
  CanvasRuntimeDependencies,
  CanvasSceneGateway,
  MutableRef,
} from "./canvasApplication.types.js";
import type { CanvasAuthoringAdapter } from "./createCanvasAuthoringAdapter.types.js";
import type { editorWorkflowMachine } from "./editorWorkflowMachine.js";
import type { PhysicsRuntime } from "./evaluateEditorFramePose.types.js";
import type { PosePhysicsLoader } from "./posePhysicsLoader.types.js";
import type { CanvasFailure } from "../domain/canvasFailureCodes.types.js";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ActorRefFrom } from "xstate";

interface CanvasSceneLifecycleOptions {
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
  generation: number;
  generationRef: MutableRef<number>;
  sceneGatewayRef: MutableRef<CanvasSceneGateway | null>;
  isDirtyRef: MutableRef<boolean>;
  meshOverriddenPartsRef: MutableRef<Set<string>>;
  rafRef: MutableRef<number | null>;
  posePhysicsRef: MutableRef<PhysicsRuntime | null>;
  posePhysicsLoaderRef: MutableRef<PosePhysicsLoader>;
  authoringAdapterRef: MutableRef<CanvasAuthoringAdapter | null>;
  markDirty: () => void;
  setCanvasFailure: Dispatch<SetStateAction<CanvasFailure | null>>;
  createRenderer: CanvasRuntimeDependencies["createRenderer"];
}

export function useCanvasSceneLifecycle({
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
}: CanvasSceneLifecycleOptions): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    const currentGeneration = generationRef.current;
    let gateway: CanvasSceneGateway;
    try {
      gateway = createRenderer({
        canvas,
        initialView: editorRef.current?.view,
        onViewChange: setView,
      });
    } catch (error) {
      if (!cancelled) {
        console.error("[useCanvasScene] Canvas renderer init failed:", error);
        setCanvasFailure({
          code: CANVAS_FAILURE_CODES.INIT_UNAVAILABLE,
          message:
            CANVAS_FAILURE_MESSAGES[CANVAS_FAILURE_CODES.INIT_UNAVAILABLE],
        });
      }
      return undefined;
    }
    const attachGateway = (): void => {
      if (cancelled || generationRef.current !== currentGeneration) return;
      gateway.createInteractionSystem({
        projectRef,
        editorRef,
        animationRef,
        updateProject,
        setSelection,
        markDirty,
        workflowActor: workflowActorRef,
        imageDataByPartId,
        executeCommand: createCanvasCommandExecutor({
          gateway: null,
          editorRef,
        }),
        animationAuthoringAdapter: authoringAdapterRef.current,
      });
      sceneGatewayRef.current = gateway;
      markDirty();
    };
    const readiness: unknown = gateway.ready;
    if (readiness instanceof Promise) {
      void readiness
        .then(() => {
          if (!cancelled) attachGateway();
        })
        .catch((error: unknown) => {
          if (!cancelled && generationRef.current === currentGeneration) {
            console.error(
              "[useCanvasScene] Canvas renderer init failed:",
              error,
            );
            try {
              gateway.dispose();
            } catch {
              /* Best-effort cleanup after failed initialization. */
            }
            setCanvasFailure({
              code: CANVAS_FAILURE_CODES.INIT_FAILED,
              message:
                CANVAS_FAILURE_MESSAGES[CANVAS_FAILURE_CODES.INIT_FAILED],
            });
          }
        });
    } else attachGateway();
    const loop = (timestamp: number): void => {
      if (cancelled || generationRef.current !== currentGeneration) return;
      const animation = animationRef.current;
      const editor = editorRef.current;
      if (animation?.tick && editor?.editorMode === "animation")
        animation.tick(timestamp);
      if (isDirtyRef.current && sceneGatewayRef.current) {
        const project = projectRef.current;
        const currentEditor = editorRef.current;
        const animationState = animationRef.current;
        if (currentEditor.activeTool === "pose" && !posePhysicsRef.current) {
          posePhysicsLoaderRef.current.load(
            () => !cancelled && generationRef.current === currentGeneration,
            (runtime) => {
              posePhysicsRef.current = runtime;
              markDirty();
            },
          );
        }
        isDirtyRef.current = renderCanvasSceneFrame({
          gateway: sceneGatewayRef.current,
          project,
          editor: currentEditor,
          animationState,
          canvas,
          isDark: isDarkRef.current ?? true,
          physicsRuntime: posePhysicsRef.current,
          meshOverriddenPartsRef,
          timestamp,
        });
      }
      if (!cancelled && generationRef.current === currentGeneration)
        rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      posePhysicsRef.current?.reset?.();
      posePhysicsRef.current = null;
      posePhysicsLoaderRef.current.reset();
      sceneGatewayRef.current = null;
      gateway.dispose();
    };
  }, [
    animationRef,
    authoringAdapterRef,
    canvasRef,
    createRenderer,
    editorRef,
    generation,
    generationRef,
    imageDataByPartId,
    isDarkRef,
    isDirtyRef,
    markDirty,
    meshOverriddenPartsRef,
    posePhysicsLoaderRef,
    posePhysicsRef,
    projectRef,
    rafRef,
    sceneGatewayRef,
    setCanvasFailure,
    setSelection,
    setView,
    updateProject,
    workflowActorRef,
  ]);
}
