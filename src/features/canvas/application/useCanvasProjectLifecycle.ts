import { useCallback } from "react";

import type { ProjectResourceOwner } from "@kukla2d/contracts";

import { createProjectResourceOwner } from "@/platform/projectResourceOwner";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import { prepareLoadedProjectState } from "@/store/project/projectStoreShared.js";
import type { ProjectStore } from "@/store/project/projectStoreTypes.types.js";
import { useProjectStore } from "@/store/projectStore";

import {
  commitWorkspaceLoad,
  stageWorkspaceLoad,
} from "./workspaceLoadTransaction.js";

import type {
  CanvasSceneGateway,
  CanvasTextureCache,
  MutableRef,
} from "./canvasApplication.types.js";
import type { WorkspaceLoadStage } from "./workspaceLoadTransaction.types.js";

type LoadProjectResult = { success: true } | { success: false; error: unknown };

interface CanvasProjectLifecycleArgs {
  centerView: (width: number, height: number) => void;
  markDirty: () => void;
  resetProject: ProjectStore["resetProject"];
  resourceOwnerRef: MutableRef<ProjectResourceOwner>;
  sceneGatewayRef: MutableRef<CanvasSceneGateway | null>;
  textureCache: CanvasTextureCache;
  imageDataMapRef: MutableRef<Map<string, ImageData> | null>;
}

export function useCanvasProjectLifecycle({
  centerView,
  markDirty,
  resetProject,
  resourceOwnerRef,
  sceneGatewayRef,
  textureCache,
  imageDataMapRef,
}: CanvasProjectLifecycleArgs): {
  handleLoadProject: (file: File) => Promise<LoadProjectResult>;
  handleReset: () => void;
} {
  const handleLoadProject = useCallback(
    async (file: File): Promise<LoadProjectResult> => {
      if (!file)
        return { success: false, error: new Error("No file provided") };
      let stagedLoad: WorkspaceLoadStage | null = null;
      let loadedResources: ProjectResourceOwner | null = null;
      try {
        const { loadProject } = await import("@/io/projectFile");
        const {
          project: loadedProject,
          images,
          resources,
        } = await loadProject(file);
        loadedResources = resources;

        const previousOwner = resourceOwnerRef.current;
        const gateway = sceneGatewayRef.current;
        stagedLoad = stageWorkspaceLoad({
          loadedProject,
          images,
          sceneGateway: gateway,
        });
        const previousRegistry = commitWorkspaceLoad({
          stagedLoad,
          commitPort: {
            commitProject: (project) => {
              useProjectStore
                .getState()
                .commitLoadedProject(prepareLoadedProjectState(project));
            },
          },
          sceneGateway: gateway,
          imageDataMap:
            imageDataMapRef.current ??
            textureCache.__internal.imageDataByPartId,
          resourceOwnerRef,
          resources,
        });

        previousRegistry?.disposeAll?.();
        stagedLoad = null;
        loadedResources = null;
        previousOwner?.dispose();
        markDirty();

        const rememberedAnimation =
          loadedProject.animations.find(
            (animation) => animation.id === loadedProject.lastActiveAnimationId,
          ) ??
          loadedProject.animations[0] ??
          null;
        if (rememberedAnimation) {
          useAnimationStore.getState().switchAnimation(rememberedAnimation);
        } else {
          useAnimationStore.getState().resetPlayback();
        }

        centerView(
          loadedProject.canvas?.width || 800,
          loadedProject.canvas?.height || 600,
        );
        return { success: true };
      } catch (err) {
        stagedLoad?.stagedResources?.dispose?.();
        loadedResources?.dispose?.();
        return { success: false, error: err };
      }
    },
    [
      centerView,
      imageDataMapRef,
      markDirty,
      resourceOwnerRef,
      sceneGatewayRef,
      textureCache,
    ],
  );

  const handleReset = useCallback(() => {
    sceneGatewayRef.current?.resources?.disposeAll?.();
    resourceOwnerRef.current?.dispose();
    resourceOwnerRef.current = createProjectResourceOwner();
    resetProject();
    textureCache.__internal.imageDataByPartId.clear();
    useAnimationStore.getState().resetPlayback?.();
    useEditorStore.getState().setSelection([]);
    markDirty();
    centerView(800, 600);
  }, [
    centerView,
    markDirty,
    resetProject,
    resourceOwnerRef,
    sceneGatewayRef,
    textureCache,
  ]);

  return { handleLoadProject, handleReset };
}
