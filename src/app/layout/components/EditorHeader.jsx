import { ChevronDown, Database, Download, FilePlus, FolderOpen, Globe2, HardDrive, Redo2, Save, Settings2, Undo2 } from 'lucide-react';
import PropTypes from 'prop-types';

import { useWorkflowActor, useWorkflowSelector } from '@/features/canvas/index.js';
import { ExportAreaPopover } from '@/features/export/index.js';

import { cn } from '@/lib/utils.js';

import { Button } from '@/components/ui/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip.jsx';

const ANIMATION_UNSAFE_TOOLS = new Set([
  'meshAdjust',
  'meshAddVertex',
  'meshRemoveVertex',
  'weightPaint',
  'drawBone',
  'drawIk',
]);

export function EditorHeader({
  projectSession,
  mode,
  requestMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenExportModal,
  onOpenPreferences,
  onOpenSchemaLibrary,
}) {
  const isAnimationMode = mode === 'animation';
  const { send } = useWorkflowActor();
  const activeTool = useWorkflowSelector(s => s.context.activeTool);

  const handleRequestMode = (nextMode) => {
    requestMode(nextMode);
    if (nextMode !== 'animation') return;
    if (['meshAdjust', 'meshAddVertex', 'meshRemoveVertex'].includes(activeTool)) {
      send({ type: 'SET_TOOL', tool: 'meshDeform' });
    } else if (ANIMATION_UNSAFE_TOOLS.has(activeTool)) {
      send({ type: 'SET_TOOL', tool: 'select' });
    }
  };

  return (
    <header className="h-10 border-b flex items-center px-4 shrink-0 bg-card gap-3 relative">
      <div className="flex items-center gap-3 h-full">
        <img src={`${import.meta.env.BASE_URL}compressed/kukla2d.png`} alt="Kukla2D" className="h-7 w-auto object-contain" />
        <span className="text-xs text-muted-foreground border border-border/50 px-1.5 py-0.5 font-mono">v{__APP_VERSION__}</span>

        <div className="flex h-full items-stretch border-l border-r ml-1 mr-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-9 rounded-none hover:bg-muted"
            onClick={projectSession.handleNewProject}
            title="New project"
          >
            <FilePlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-9 rounded-none border-l hover:bg-muted"
            onClick={projectSession.openSaveModal}
            title="Save project"
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-9 rounded-none border-l hover:bg-muted"
            onClick={projectSession.openLoadModal}
            title="Load project"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-9 rounded-none border-l hover:bg-muted"
            onClick={onOpenExportModal}
            title="Export frames"
          >
            <Download className="h-4 w-4" />
          </Button>

          <ExportAreaPopover />

          <Button
            variant="ghost"
            size="icon"
            className="h-full w-9 rounded-none border-l hover:bg-muted"
            onClick={onOpenPreferences}
            title="Preferences"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <TooltipProvider delayDuration={400}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center bg-muted/30 rounded-lg p-0.5 border border-border/40">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleRequestMode('staging')}
                  className={cn(
                    'px-3 py-1 rounded-md text-[13px] font-semibold transition-all flex items-center gap-1.5',
                    !isAnimationMode
                      ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Staging
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                In Staging mode, you set the base layout, mesh structure, and joint positions.
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleRequestMode('animation')}
                  className={cn(
                    'px-3 py-1 rounded-md text-[13px] font-semibold transition-all flex items-center gap-1.5 ml-0.5',
                    isAnimationMode
                      ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Animation
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                In Animation mode, you create keyframes on the timeline.
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border/40 mx-2" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-muted/80 disabled:opacity-30"
                  disabled={!canUndo}
                  onClick={onUndo}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-muted/80 disabled:opacity-30 ml-0.5"
                  disabled={!canRedo}
                  onClick={onRedo}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Redo (Ctrl+Y)</TooltipContent>
            </Tooltip>
        </div>
      </TooltipProvider>

      <div className="flex-1" />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2 border border-border/50 px-2.5 text-xs font-normal"
            aria-label="Schema database connection"
          >
            <Database className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-muted-foreground">Connected to:</span>
            <span className="font-medium">local (indexedDB)</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-72 p-1.5">
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2">
            <HardDrive className="mt-0.5 h-4 w-4 text-emerald-500" />
            <div>
              <p className="text-xs font-medium">local (indexedDB)</p>
              <p className="text-[10px] text-muted-foreground">
                Schemas stay in this browser.
              </p>
            </div>
          </div>
          <div
            className="mt-1 flex cursor-not-allowed items-start gap-2 rounded-md px-2.5 py-2 opacity-45"
            aria-disabled="true"
            title="Global schema database is not available yet"
          >
            <Globe2 className="mt-0.5 h-4 w-4" />
            <div>
              <p className="text-xs font-medium">global (KuklaDB)</p>
              <p className="text-[10px] text-muted-foreground">
                Coming later
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={onOpenSchemaLibrary}
          >
            Browse schema library…
          </Button>
        </PopoverContent>
      </Popover>
    </header>
  );
}

EditorHeader.propTypes = {
  projectSession: PropTypes.shape({
    handleNewProject: PropTypes.func.isRequired,
    openSaveModal: PropTypes.func.isRequired,
    openLoadModal: PropTypes.func.isRequired,
  }).isRequired,
  mode: PropTypes.string.isRequired,
  requestMode: PropTypes.func.isRequired,
  canUndo: PropTypes.bool.isRequired,
  canRedo: PropTypes.bool.isRequired,
  onUndo: PropTypes.func.isRequired,
  onRedo: PropTypes.func.isRequired,
  onOpenExportModal: PropTypes.func.isRequired,
  onOpenPreferences: PropTypes.func.isRequired,
  onOpenSchemaLibrary: PropTypes.func.isRequired,
};
