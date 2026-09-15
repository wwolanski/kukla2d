import { Check, X } from 'lucide-react';
import { useEffect } from 'react';

import { useEditorStore } from '@/store/editorStore.js';
import { useProjectStore } from '@/store/projectStore.js';

import {
  assignConstraintToBone,
  findConstraintConflict,
} from '@/features/canvas/domain/ikConstraintCreation.js';

export function IkAssignPrompt({ view }) {
  const interaction = useEditorStore(state => state.interaction);
  const setInteraction = useEditorStore(state => state.setInteraction);
  const project = useProjectStore(state => state.project);
  const updateProject = useProjectStore(state => state.updateProject);

  useEffect(() => {
    if (!['ikNotice', 'canvasNotice'].includes(interaction?.kind)) return undefined;
    const timeout = window.setTimeout(() => setInteraction({ kind: 'idle' }), 2400);
    return () => window.clearTimeout(timeout);
  }, [interaction, setInteraction]);

  if (['ikNotice', 'canvasNotice'].includes(interaction?.kind)) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-md border border-amber-500/40 bg-background/95 px-3 py-2 text-xs text-amber-300 shadow-xl backdrop-blur">
        {interaction.message}
      </div>
    );
  }
  if (interaction?.kind === 'pendingPickIKBone') {
    return (
      <div className="pointer-events-none absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-md border border-border/70 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
        <div className="font-medium text-foreground">Select an available bone for this IK target</div>
        {interaction.error && (
          <div className="mt-1 text-[11px] text-destructive">{interaction.error}</div>
        )}
      </div>
    );
  }
  if (interaction?.kind !== 'pendingSuggestIKBone') return null;
  const constraint = project.constraints?.find(item => item.id === interaction.constraintId);
  const bone = project.bones?.find(item => item.id === interaction.boneId);
  if (!constraint || !bone) return null;

  const left = (constraint.targetX ?? 0) * view.zoom + view.panX;
  const top = (constraint.targetY ?? 0) * view.zoom + view.panY - 56;
  const confirm = () => {
    const conflict = findConstraintConflict(
      project.constraints ?? [],
      project.bones ?? [],
      interaction.boneId,
      interaction.constraintId,
    );
    if (conflict) {
      setInteraction({
        kind: 'pendingPickIKBone',
        constraintId: interaction.constraintId,
        error: `${conflict.name} already controls this bone chain`,
      });
      return;
    }
    updateProject(projectDraft => {
      const target = projectDraft.constraints?.find(item => item.id === interaction.constraintId);
      assignConstraintToBone(target, projectDraft.bones ?? [], interaction.boneId);
    });
    setInteraction({ kind: 'idle' });
  };

  return (
    <div
      className="absolute z-50 min-w-56 rounded-md border border-border/70 bg-background/95 p-2 shadow-xl backdrop-blur"
      style={{ left, top, transform: 'translate(-50%, -100%)' }}
    >
      <div className="mb-2 text-[11px] font-medium text-foreground">
        Assign {constraint.name} to {bone.name} and its children?
      </div>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setInteraction({
            kind: 'pendingPickIKBone',
            constraintId: interaction.constraintId,
          })}
          aria-label="Choose another bone"
          title="Choose another bone"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          onClick={confirm}
          aria-label="Confirm IK assignment"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
