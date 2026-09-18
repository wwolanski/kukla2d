import PropTypes from "prop-types";
import { lazy, Suspense, useCallback } from "react";

import {
  loadAnimationListPanel,
  loadTimelinePanel,
} from "@/app/layout/components/editorWorkspaceLazyLoaders.js";

import { AutoMotionPanel } from "@/features/auto-motion/index.js";
import { CanvasViewport } from "@/features/canvas/index.js";
import { Inspector } from "@/features/inspector/index.js";
import { LayerPanel } from "@/features/layers/index.js";
import {
  WorkspaceToolbar,
  PoseToolButton,
  ToolSettingsBar,
  WorkspaceStatus,
} from "@/features/projects/index.js";

import { HelpIcon } from "@/components/ui/help-icon.jsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.jsx";
import { TooltipProvider } from "@/components/ui/tooltip.jsx";

const TimelinePanel = lazy(loadTimelinePanel);
const AnimationListPanel = lazy(loadAnimationListPanel);
const DEFAULT_SIDE_PANEL_SIZE = 22;
const DEFAULT_CENTER_PANEL_SIZE = 100 - DEFAULT_SIDE_PANEL_SIZE * 2;

export function EditorWorkspace({
  editorStarted,
  isAnimationMode,
  remeshRef,
  deleteMeshRef,
  saveRef,
  loadRef,
  resetRef,
  importRef,
  exportCaptureRef,
  thumbCaptureRef,
  onRemesh,
  onDeleteMesh,
  onLoadExampleProject,
  onImportModularSprite,
  onRegenerateModularSprite,
}) {
  const handleImportClick = useCallback(() => {
    importRef.current?.openFilePicker?.();
  }, [importRef]);

  const handleImportFiles = useCallback(
    (files) => {
      importRef.current?.importFiles?.(files);
    },
    [importRef],
  );

  return (
    <div className="flex-1 overflow-hidden">
      <ResizablePanelGroup id="root-group" direction="horizontal">
        {editorStarted && (
          <>
            <ResizablePanel
              id="layers-panel"
              order={1}
              defaultSize={DEFAULT_SIDE_PANEL_SIZE}
              minSize={12}
              maxSize={28}
              className="min-w-0"
            >
              <div className="flex h-full min-h-0 min-w-0 flex-col border-r">
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  <LayerPanel
                    onImportClick={handleImportClick}
                    onImportFiles={handleImportFiles}
                    onLoadExampleProject={onLoadExampleProject}
                    onImportModularSprite={onImportModularSprite}
                    onRegenerateModularSprite={onRegenerateModularSprite}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle id="handle-layers" />
          </>
        )}

        <ResizablePanel
          id="center-panel"
          order={2}
          defaultSize={editorStarted ? DEFAULT_CENTER_PANEL_SIZE : 100}
        >
          <ResizablePanelGroup id="center-group" direction="vertical">
            <ResizablePanel
              id="canvas-panel"
              order={1}
              defaultSize={isAnimationMode ? 75 : 100}
            >
              <div className="relative h-full w-full">
                {editorStarted && (
                  <>
                    <div className="absolute left-3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-2">
                      <PoseToolButton />
                      <WorkspaceToolbar />
                    </div>
                    <ToolSettingsBar />
                    <WorkspaceStatus />
                  </>
                )}

                <CanvasViewport
                  remeshRef={remeshRef}
                  deleteMeshRef={deleteMeshRef}
                  saveRef={saveRef}
                  loadRef={loadRef}
                  resetRef={resetRef}
                  importRef={importRef}
                  exportCaptureRef={exportCaptureRef}
                  thumbCaptureRef={thumbCaptureRef}
                />
              </div>
            </ResizablePanel>

            {isAnimationMode && (
              <>
                <ResizableHandle id="handle-timeline" />
                <ResizablePanel
                  id="timeline-panel"
                  order={2}
                  defaultSize={25}
                  minSize={12}
                  collapsible
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-col border-t">
                    <Suspense fallback={null}>
                      <TimelinePanel />
                    </Suspense>
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        {editorStarted && (
          <>
            <ResizableHandle id="handle-inspector" />
            <ResizablePanel
              id="inspector-panel"
              order={3}
              defaultSize={DEFAULT_SIDE_PANEL_SIZE}
              minSize={20}
              maxSize={40}
              className="bg-card border-l transition-all duration-300"
            >
              <ResizablePanelGroup id="inspector-group" direction="vertical">
                <ResizablePanel
                  id="inspector-column"
                  order={1}
                  defaultSize={isAnimationMode ? 75 : 100}
                  minSize={30}
                >
                  <TooltipProvider delayDuration={200}>
                    <Tabs
                      defaultValue="main"
                      className="flex h-full flex-col border-l overflow-hidden"
                    >
                      <TabsList className="grid h-9 w-full grid-cols-2 rounded-none border-b bg-muted/20 p-0">
                        <TabsTrigger
                          value="main"
                          className="h-9 rounded-none text-[10px] font-semibold tracking-wider"
                        >
                          MAIN
                        </TabsTrigger>
                        <TabsTrigger
                          value="auto-motion"
                          className="h-9 rounded-none text-[10px] font-semibold tracking-wider"
                        >
                          AUTO MOTION
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent
                        value="main"
                        className="m-0 flex min-h-0 flex-1 flex-col"
                      >
                        <div className="px-3 py-2 border-b shrink-0 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Inspector
                            </h2>
                            <HelpIcon
                              tip="Properties of the active selection. Edit transform, mesh, texture, and bone settings here."
                              side="left"
                            />
                          </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <Inspector
                            onRemesh={onRemesh}
                            onDeleteMesh={onDeleteMesh}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent
                        value="auto-motion"
                        className="m-0 min-h-0 flex-1 flex-col"
                      >
                        <AutoMotionPanel />
                      </TabsContent>
                    </Tabs>
                  </TooltipProvider>
                </ResizablePanel>

                {isAnimationMode && (
                  <>
                    <ResizableHandle id="handle-animation-list" />
                    <ResizablePanel
                      id="animation-list-panel"
                      order={2}
                      defaultSize={25}
                      minSize={10}
                    >
                      <Suspense fallback={null}>
                        <AnimationListPanel />
                      </Suspense>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

const refShape = PropTypes.shape({ current: PropTypes.any });

EditorWorkspace.propTypes = {
  editorStarted: PropTypes.bool.isRequired,
  isAnimationMode: PropTypes.bool.isRequired,
  remeshRef: refShape.isRequired,
  deleteMeshRef: refShape.isRequired,
  saveRef: refShape.isRequired,
  loadRef: refShape.isRequired,
  resetRef: refShape.isRequired,
  importRef: refShape.isRequired,
  exportCaptureRef: refShape.isRequired,
  thumbCaptureRef: refShape.isRequired,
  onRemesh: PropTypes.func.isRequired,
  onDeleteMesh: PropTypes.func.isRequired,
  onLoadExampleProject: PropTypes.func.isRequired,
  onImportModularSprite: PropTypes.func.isRequired,
  onRegenerateModularSprite: PropTypes.func.isRequired,
};
