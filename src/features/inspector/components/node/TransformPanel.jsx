import { useTransformInspectorController } from "@/features/inspector/application/useNodeInspectorController.js";
import {
  SectionTitle,
  InspectorRow,
} from "@/features/inspector/components/fields/InspectorRow.jsx";
import { NumericInput } from "@/features/inspector/components/fields/NumericInput.jsx";

import { Button } from "@/components/ui/button.jsx";
import { Label } from "@/components/ui/label.jsx";

export function TransformPanel({ node, allNodes }) {
  const { editorMode, setTransformField, commitTransform, resetTransform } =
    useTransformInspectorController(node);

  const t = node.transform ?? {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    pivotX: 0,
    pivotY: 0,
  };

  return (
    <div className="space-y-1.5">
      <SectionTitle>Transform</SectionTitle>

      <div className="flex items-center gap-1 py-0.5">
        <Label className="text-xs text-muted-foreground w-8 shrink-0">
          Pos
        </Label>
        <div className="flex gap-1 flex-1 justify-end">
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground/60">X</span>
            <NumericInput
              data-testid="transform-x"
              value={t.x ?? 0}
              onChange={(v) => setTransformField("x", v)}
              onBlur={commitTransform}
              step={1}
              precision={1}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground/60">Y</span>
            <NumericInput
              data-testid="transform-y"
              value={t.y ?? 0}
              onChange={(v) => setTransformField("y", v)}
              onBlur={commitTransform}
              step={1}
              precision={1}
            />
          </div>
        </div>
      </div>

      <InspectorRow label="Rotation °">
        <NumericInput
          value={t.rotation ?? 0}
          onChange={(v) => setTransformField("rotation", v)}
          onBlur={commitTransform}
          step={0.5}
          precision={1}
        />
      </InspectorRow>

      <div className="flex items-center gap-1 py-0.5">
        <Label className="text-xs text-muted-foreground w-8 shrink-0">
          Scale
        </Label>
        <div className="flex gap-1 flex-1 justify-end">
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground/60">X</span>
            <NumericInput
              value={t.scaleX ?? 1}
              onChange={(v) => setTransformField("scaleX", v)}
              onBlur={commitTransform}
              step={0.05}
              precision={2}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground/60">Y</span>
            <NumericInput
              value={t.scaleY ?? 1}
              onChange={(v) => setTransformField("scaleY", v)}
              onBlur={commitTransform}
              step={0.05}
              precision={2}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 py-0.5">
        <Label className="text-xs text-muted-foreground w-8 shrink-0">
          Pivot
        </Label>
        <div className="flex gap-1 flex-1 justify-end">
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground/60">X</span>
            <NumericInput
              value={t.pivotX ?? 0}
              onChange={(v) => setTransformField("pivotX", v)}
              disabled={editorMode === "animation"}
              title={
                editorMode === "animation"
                  ? "Pivot defines Staging geometry."
                  : undefined
              }
              step={1}
              precision={1}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground/60">Y</span>
            <NumericInput
              value={t.pivotY ?? 0}
              onChange={(v) => setTransformField("pivotY", v)}
              disabled={editorMode === "animation"}
              title={
                editorMode === "animation"
                  ? "Pivot defines Staging geometry."
                  : undefined
              }
              step={1}
              precision={1}
            />
          </div>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full h-6 text-[10px] mt-1"
        disabled={editorMode === "animation"}
        onClick={resetTransform}
      >
        Reset Transform
      </Button>

      {(() => {
        const JSKinningRoles = new Set([
          "leftElbow",
          "rightElbow",
          "leftKnee",
          "rightKnee",
        ]);
        if (!JSKinningRoles.has(node.boneRole)) return null;
        const hasDependent = allNodes.some(
          (n) => n.type === "part" && n.mesh?.jointBoneId === node.id,
        );
        if (hasDependent) return null;
        return (
          <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs leading-relaxed text-amber-500">
            <span className="font-bold">⚠ Limb mesh required.</span> To enable
            rotation deformation: (1) Hide armature, (2) Select the limb layer,
            and (3) Click &apos;Remesh&apos;.
          </div>
        );
      })()}
    </div>
  );
}
