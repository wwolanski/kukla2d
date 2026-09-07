import { useRef, useEffect, useMemo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

import { createProjectResourceOwner } from "@/platform/projectResourceOwner";

import { useTheme } from "@/app/providers/theme/useTheme.js";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import { EditorWorkflowContext } from "@/features/canvas/application/EditorWorkflowContext.js";
import { useCanvasCapture } from "@/features/canvas/application/useCanvasCapture.js";
import { useCanvasGpuSync } from "@/features/canvas/application/useCanvasGpuSync.js";
import { useCanvasImperativeApi } from "@/features/canvas/application/useCanvasImperativeApi.js";
import { useCanvasImport } from "@/features/canvas/application/useCanvasImport.js";
import { useCanvasInput } from "@/features/canvas/application/useCanvasInput.js";
import { useCanvasKeyboardShortcuts } from "@/features/canvas/application/useCanvasKeyboardShortcuts.js";
import { useCanvasScene } from "@/features/canvas/application/useCanvasScene.js";
import { useMeshCommands } from "@/features/canvas/application/useMeshCommands.js";
import { useWorkflowActor } from "@/features/canvas/application/useWorkflowActor.js";

import { computeViewportFit } from "./viewportFit.js";

import type {
  CanvasEditorSnapshot,
  CanvasRuntimeDependencies,
} from "./canvasApplication.types.js";
import type { Dispatch, RefObject, SetStateAction } from "react";

interface CanvasControllerProps {
  remeshRef?: RefObject<unknown> | undefined;
  deleteMeshRef?: RefObject<unknown> | undefined;
  saveRef?: RefObject<unknown> | undefined;
  loadRef?: RefObject<unknown> | undefined;
  resetRef?: RefObject<unknown> | undefined;
  exportCaptureRef?: RefObject<unknown> | undefined;
  thumbCaptureRef?: RefObject<unknown> | undefined;
  setConfirmWipeOpen: Dispatch<SetStateAction<boolean>>;
  pendingFile: File | null;
  setPendingFile: Dispatch<SetStateAction<File | null>>;
  onRequestDelete: () => void;
  runtime: CanvasRuntimeDependencies;
}

function useCanvasControllerImpl({
  remeshRef,
  deleteMeshRef,
  saveRef,
  loadRef,
  resetRef,
  exportCaptureRef,
  thumbCaptureRef,
  setConfirmWipeOpen,
  pendingFile,
  setPendingFile,
  onRequestDelete,
  runtime,
}: CanvasControllerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const project = useProjectStore((s) => s.project);
  const versionControl = useProjectStore((s) => s.versionControl);
  const updateProject = useProjectStore((s) => s.updateProject);
  const resetProject = useProjectStore((s) => s.resetProject);

  const editorUiState = useEditorStore(
    useShallow((s) => ({
      selection: s.selection,
      view: s.view,
    })),
  );
  const activeTool = EditorWorkflowContext.useSelector(
    (s) => s.context.activeTool,
  );
  const weightPaintMode = EditorWorkflowContext.useSelector(
    (s) => s.context.weightPaintMode,
  );
  const meshEditMode = EditorWorkflowContext.useSelector(
    (s) => s.context.meshEditMode,
  );
  const meshSubMode = EditorWorkflowContext.useSelector(
    (s) => s.context.meshSubMode,
  );
  const editorState = useMemo(
    () => ({
      ...editorUiState,
      activeTool,
      weightPaintMode,
      meshEditMode,
      meshSubMode,
    }),
    [editorUiState, activeTool, weightPaintMode, meshEditMode, meshSubMode],
  );

  const setView = useEditorStore((s) => s.setView);
  const setBrush = useEditorStore((s) => s.setBrush);
  const setSelection = useEditorStore((s) => s.setSelection);

  const { themeMode, osTheme } = useTheme();
  const isDark =
    themeMode === "system" ? osTheme === "dark" : themeMode === "dark";

  const projectRef = useRef(project);
  const editorRef = useRef<CanvasEditorSnapshot>(useEditorStore.getState());
  const animationRef = useRef(useAnimationStore.getState());
  const isDarkRef = useRef(isDark);
  const resourceOwnerRef = useRef(createProjectResourceOwner());

  projectRef.current = project;
  isDarkRef.current = isDark;

  const { send: sendWorkflowEvent } = useWorkflowActor();
  const workflowActorRef = EditorWorkflowContext.useActorRef();
  editorRef.current = {
    ...useEditorStore.getState(),
    ...workflowActorRef.getSnapshot().context,
  };

  const viewportCenterView = useCallback(
    (contentW: number, contentH: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      if (vw === 0 || vh === 0) return;
      const zoom = editorRef.current.view.zoom;
      setView({
        panX: vw / 2 - (contentW / 2) * zoom,
        panY: vh / 2 - (contentH / 2) * zoom,
      });
    },
    [setView],
  );

  /**
   * Re-fit the view to the project's content. Used after import, where the
   * caller (the import path) runs *synchronously* after `updateProject`,
   * before the layers/inspector panels have re-rendered and shrunk the
   * canvas. The first call uses the canvas size at call time, then we
   * schedule a second call for after the next paint so the layout has
   * settled.
   */
  const fitProjectToView = useCallback(
    (fallbackW: number, fallbackH: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      if (vw === 0 || vh === 0) return;

      const fit = computeViewportFit({
        viewportWidth: vw,
        viewportHeight: vh,
        parts: projectRef.current?.nodes ?? [],
        fallbackWidth: fallbackW,
        fallbackHeight: fallbackH,
      });
      if (fit) setView(fit);
    },
    [setView],
  );

  const meshWorkerClientRef = useRef<ReturnType<
    CanvasRuntimeDependencies["createMeshWorkerClient"]
  > | null>(null);
  if (!meshWorkerClientRef.current) {
    meshWorkerClientRef.current = runtime.createMeshWorkerClient();
  }
  useEffect(() => {
    return () => meshWorkerClientRef.current?.dispose();
  }, []);

  useEffect(() => {
    const owner = resourceOwnerRef.current;
    return () => owner?.dispose();
  }, []);

  const textureCache = useMemo(
    () => runtime.createTextureImageCache(),
    [runtime],
  );

  const scene = useCanvasScene({
    canvasRef,
    projectRef,
    editorRef,
    animationRef,
    isDarkRef,
    setView,
    setSelection,
    updateProject,
    imageDataByPartId: textureCache.__internal.imageDataByPartId,
    workflowActorRef,
    createRenderer: runtime.createRenderer,
  });
  const sceneMarkDirty = scene.markDirty;

  useEffect(() => {
    sceneMarkDirty();
  }, [isDark, sceneMarkDirty]);

  const capture = useCanvasCapture({
    canvasRef,
    projectRef,
    editorRef,
    animationRef,
    captureFrame: scene.captureFrame,
    sceneGatewayRef: scene.sceneGatewayRef,
    captureCanvasDataUrl: runtime.captureCanvasDataUrl,
    imageDataToDataUrl: runtime.imageDataToDataUrl,
  });

  const mesh = useMeshCommands({
    projectRef,
    updateProject,
    meshWorkerClient: meshWorkerClientRef.current,
    sceneGatewayRef: scene.sceneGatewayRef,
    markDirty: scene.markDirty,
    sendWorkflowEvent,
  });

  const importHooks = useCanvasImport({
    projectRef,
    canvasRef,
    editorRef,
    updateProject,
    resetProject,
    centerView: (w: number, h: number) => {
      // Defer to next frame so the layers panel (which appears when the
      // first part is added) has a chance to render and shrink the canvas.
      // Without this, we capture the canvas size *before* the panels re-layout
      // and the part ends up off-centre after the panels re-layout.
      requestAnimationFrame(() => fitProjectToView(w, h));
    },
    sceneGatewayRef: scene.sceneGatewayRef,
    textureCache,
    markDirty: scene.markDirty,
    setConfirmWipeOpen,
    pendingFile,
    setPendingFile,
    animRef: animationRef,
    sendWorkflowEvent,
    resourceOwnerRef,
  });

  const input = useCanvasInput({
    fileInputRef,
  });

  useCanvasImperativeApi(
    {
      remeshRef,
      deleteMeshRef,
      saveRef,
      loadRef,
      resetRef,
      exportCaptureRef,
      thumbCaptureRef,
    },
    {
      remeshPart: mesh.remeshPart,
      deleteMeshForPart: mesh.deleteMeshForPart,
      handleSave: importHooks.handleSave,
      handleLoadProject: importHooks.handleLoadProject,
      handleReset: importHooks.handleReset,
      captureExportFrame: capture.captureExportFrame,
      captureStaging: capture.captureStaging,
    },
  );

  useCanvasGpuSync({
    sceneGatewayRef: scene.sceneGatewayRef,
    projectRef,
    textureCache,
    isDirtyRef: scene.isDirtyRef,
    project,
    versionControl,
  });

  useCanvasKeyboardShortcuts({
    editorRef,
    projectRef,
    setBrush,
    sendWorkflowEvent,
    onRequestDelete,
  });

  return {
    refs: {
      canvasRef,
      fileInputRef,
    },
    sceneGatewayRef: scene.sceneGatewayRef,
    isDirtyRef: scene.isDirtyRef,
    markDirty: scene.markDirty,
    centerView: viewportCenterView,
    captureFrame: scene.captureFrame,
    projectRef,
    editorRef,
    animationRef,
    isDarkRef,
    textureCache,
    meshWorkerClientRef,
    mesh,
    capture,
    import: importHooks,
    input,
    canvasFailure: scene.canvasFailure,
    retryCanvas: scene.retryCanvas,
    store: {
      editorState,
      project,
      setBrush,
    },
  };
}

export const useCanvasController = (
  ...args: Parameters<typeof useCanvasControllerImpl>
): ReturnType<typeof useCanvasControllerImpl> =>
  useCanvasControllerImpl(...args);
