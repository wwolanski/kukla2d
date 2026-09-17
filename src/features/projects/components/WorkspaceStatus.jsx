import { useEditorStore } from "@/store/editorStore.js";

import { useWorkflowSelector } from "@/features/canvas/index.js";
import { useLinkedTargetInfo } from "@/features/projects/application/useLinkedTargetInfo.js";

const TOOL_LABEL = {
  select: "Selecting",
  transform: "Transforming elements",
  drawBone: "Drawing bone",
  drawIk: "Editing IK constraints",
  weightPaint: "Painting weights",
  meshEdit: "Editing mesh",
};

export function WorkspaceStatus() {
  const activeTool = useWorkflowSelector((s) => s.context.activeTool);
  const selectionTarget = useWorkflowSelector((s) => s.context.selectionTarget);
  const interaction = useEditorStore((s) => s.interaction);
  const weightPaintBoneId = useEditorStore((s) => s.weightPaintBoneId);
  const activeBoneId = useEditorStore((s) => s.activeBoneId);
  const setRigSelection = useEditorStore((s) => s.setRigSelection);
  const linkedTarget = useLinkedTargetInfo();

  let text = TOOL_LABEL[activeTool] ?? "Ready";
  if (activeTool === "select") {
    text =
      selectionTarget === "rig"
        ? "You are now selecting bones and constraints"
        : selectionTarget === "element"
          ? "You are now selecting elements"
          : "You are now selecting everything";
  }
  if (activeTool === "weightPaint") {
    text = `Painting weights${weightPaintBoneId || activeBoneId ? "" : ": choose bone"}`;
  }
  if (interaction?.kind === "pendingAssignBone") {
    text = "Confirm bone assignment";
  }
  if (linkedTarget) {
    text = `Editing layer offset relative to ${linkedTarget.boneName}`;
  }

  return (
    <div className="absolute left-1/2 top-14 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border/70 bg-background/90 px-3 py-1.5 text-[12px] font-medium text-foreground shadow-lg backdrop-blur">
      <span className="pointer-events-none">{text}</span>
      {linkedTarget && (
        <button
          type="button"
          className="rounded border border-border px-1.5 py-0.5 text-primary hover:bg-muted"
          onClick={() =>
            setRigSelection({
              boneIds: [linkedTarget.boneId],
              activeBoneId: linkedTarget.boneId,
            })
          }
        >
          Select linked bone
        </button>
      )}
    </div>
  );
}
