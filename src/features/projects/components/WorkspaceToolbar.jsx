import { Bone, Grid2x2, MousePointer2, Move, Paintbrush, PenTool, PersonStanding, Plus, Target, Trash2 } from 'lucide-react';

import { useEditorStore } from '@/store/editorStore.js';
import { useProjectStore } from '@/store/projectStore.js';

import { getFeedback } from '@/domain/editorModeFeedback.js';
import { editorModePolicy, ACTION_IDS } from '@/domain/editorModePolicy.js';

import { useWorkflowActor, useWorkflowSelector } from '@/features/canvas/index.js';

import { cn } from '@/lib/utils.js';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.jsx';

const TOOL_ACTION_MAP = {
  meshDeform: ACTION_IDS.NODE_MESH_DEFORM,
  meshAdjust: ACTION_IDS.REMESH,
  meshAddVertex: ACTION_IDS.REMESH,
  meshRemoveVertex: ACTION_IDS.REMESH,
  drawBone: ACTION_IDS.BONE_CREATE,
  drawIk: ACTION_IDS.IK_CREATE,
  weightPaint: ACTION_IDS.WEIGHTS_EDIT,
};

const TOOLS = [
  { id: 'select', label: 'Select', key: 'S', icon: MousePointer2 },
  { id: 'transform', label: 'Transform', key: 'V', icon: Move },
  { id: 'meshDeform', label: 'Mesh deform', key: 'M', icon: Paintbrush, requiresMesh: true },
  { id: 'meshAdjust', label: 'Mesh adjust', key: 'A', icon: Grid2x2, requiresMesh: true },
  { id: 'meshAddVertex', label: 'Add vertex', key: '+', icon: Plus, requiresMesh: true },
  { id: 'meshRemoveVertex', label: 'Remove vertex', key: '-', icon: Trash2, requiresMesh: true },
  { id: 'weightPaint', label: 'Paint weights', key: 'W', icon: PenTool, requiresMesh: true, requiresBone: true },
  { id: 'pose', label: 'Pose rig', key: 'P', icon: PersonStanding },
  { id: 'drawBone', label: 'Draw bone', key: 'B', icon: Bone },
  { id: 'drawIk', label: 'Draw IK', key: 'C', icon: Target },
];

export function PoseToolButton() {
  const { send } = useWorkflowActor();
  const activeTool = useWorkflowSelector((s) => s.context.activeTool);
  const isActive = activeTool === 'pose';

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Pose rig (P)"
            onClick={() => send({ type: 'SET_TOOL', tool: 'pose' })}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-background/92 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <PersonStanding className="h-5 w-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Pose rig (P)</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function WorkspaceToolbar() {
  const { send } = useWorkflowActor();
  const activeTool = useWorkflowSelector((s) => s.context.activeTool);
  const selectionTarget = useWorkflowSelector((s) => s.context.selectionTarget);
  const editorMode = useEditorStore(s => s.editorMode);
  const selection = useEditorStore(s => s.selection);
  const weightPaintBoneId = useEditorStore(s => s.weightPaintBoneId);
  const setWeightPaintBoneId = useEditorStore(s => s.setWeightPaintBoneId);
  const nodes = useProjectStore(s => s.project.nodes ?? []);
  const bones = useProjectStore(s => s.project.bones ?? []);
  const selectedPart = nodes.find(node => node.id === selection?.[0] && node.type === 'part');
  const selectedPartHasMesh = !!selectedPart?.mesh?.vertices?.length;
  const firstBoneId = bones[0]?.id ?? null;

  const activateTool = (tool) => {
    if (tool.id === 'weightPaint' && !weightPaintBoneId && firstBoneId) {
      setWeightPaintBoneId(firstBoneId);
    }
    send({ type: 'SET_TOOL', tool: tool.id });
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex flex-col items-center gap-1 rounded-md border border-border/70 bg-background/92 p-1 shadow-xl backdrop-blur">
        {TOOLS.filter(t => t.id !== 'pose').map(tool => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          const actionId = TOOL_ACTION_MAP[tool.id];
          const decision = actionId
            ? editorModePolicy({ mode: editorMode, actionId, targetKind: 'tool' })
            : null;
          const needsMesh = tool.requiresMesh && !selectedPartHasMesh;
          const needsBone = tool.requiresBone && bones.length === 0;
          const isBlocked = (decision && !decision.allowed) || needsMesh || needsBone;
          const feedback = decision && !decision.allowed ? getFeedback(decision.reasonCode) : null;
          const disabledReason = needsMesh
            ? 'Select a part with generated mesh'
            : needsBone
              ? 'Create a bone before painting weights'
              : feedback?.suggestedAction;
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${tool.label} (${tool.key})`}
                  disabled={isBlocked}
                  onClick={() => activateTool(tool)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                    isBlocked && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{isBlocked ? disabledReason : `${tool.label} (${tool.key})`}</TooltipContent>
            </Tooltip>
          );
        })}

        <div className="my-1 h-px w-6 bg-border/70" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Select everything"
              onClick={() => send({ type: 'SET_SELECTION_TARGET', target: 'all' })}
              className={cn(
                'flex h-7 w-8 items-center justify-center rounded text-[9px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground',
                ['select', 'transform'].includes(activeTool) && selectionTarget === 'all' && 'bg-primary/15 text-primary'
              )}
            >
              ALL
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Select everything (Alt cycles modes)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Select elements"
              onClick={() => send({ type: 'SET_SELECTION_TARGET', target: 'element' })}
              className={cn(
                'flex h-7 w-8 items-center justify-center rounded text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground',
                ['select', 'transform'].includes(activeTool) && selectionTarget === 'element' && 'bg-primary/15 text-primary'
              )}
            >
              EL
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Select elements</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Select bones and constraints"
              onClick={() => send({ type: 'SET_SELECTION_TARGET', target: 'rig' })}
              className={cn(
                'flex h-7 w-8 items-center justify-center rounded text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground',
                ['select', 'transform', 'pose'].includes(activeTool) && selectionTarget === 'rig' && 'bg-primary/15 text-primary'
              )}
            >
              RG
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Select bones and constraints</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
