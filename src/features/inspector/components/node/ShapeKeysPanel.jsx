import { useShapeKeysController } from "@/features/inspector/application/useNodeInspectorController.js";
import { SectionTitle } from "@/features/inspector/components/fields/InspectorRow.jsx";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export function ShapeKeysPanel({ node }) {
  const {
    blendShapeEditMode,
    activeBlendShapeId,
    addShape: handleAddShape,
    deleteShape: handleDeleteShape,
    renameShape: handleRenameShape,
    setInfluence: handleInfluenceChange,
    commitInfluence: handleInfluenceCommit,
    enterEditMode: handleEnterEditMode,
    exitEditMode: handleExitEditMode,
  } = useShapeKeysController(node);
  if (!node?.blendShapes) return null;

  const shapes = node.blendShapes;

  if (blendShapeEditMode && activeBlendShapeId) {
    const editingShape = shapes.find((s) => s.id === activeBlendShapeId);
    return (
      <div className="space-y-2">
        <SectionTitle help="Blend shapes for facial expressions and morph targets. Edit mode enters vertex sculpting for the selected key.">
          Shape Keys
        </SectionTitle>
        <div className="flex items-center justify-between rounded bg-primary/10 border border-primary/30 px-2 py-1.5 gap-2">
          <span className="text-xs text-primary font-medium">
            Editing: {editingShape?.name ?? "..."}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] shrink-0"
            onClick={handleExitEditMode}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionTitle help="Blend shapes for facial expressions and morph targets. Edit mode enters vertex sculpting for the selected key.">
          Shape Keys
        </SectionTitle>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-sm shrink-0"
          onClick={handleAddShape}
          title="Add shape key"
        >
          +
        </Button>
      </div>

      <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
        <span className="flex-1">Basis</span>
        <span className="w-14"></span>
      </div>

      {shapes.map((shape) => {
        const influence = node.blendShapeValues?.[shape.id] ?? 0;
        return (
          <div
            key={shape.id}
            className={`flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors ${
              activeBlendShapeId === shape.id ? "bg-primary/10" : ""
            }`}
          >
            <input
              className="flex-1 text-xs bg-transparent min-w-0 border-0 outline-none px-1"
              value={shape.name}
              onChange={(e) => handleRenameShape(shape.id, e.target.value)}
              style={{ color: "inherit" }}
            />

            <div className="w-16">
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[influence]}
                onValueChange={([v]) => handleInfluenceChange(shape.id, v)}
                onPointerUp={() => handleInfluenceCommit(shape.id)}
                className="w-full"
              />
            </div>

            <span className="text-[10px] tabular-nums w-6 text-right text-muted-foreground">
              {influence.toFixed(2)}
            </span>

            <button
              className="text-muted-foreground hover:text-primary transition-colors p-0.5 shrink-0"
              onClick={() => handleEnterEditMode(shape.id)}
              title="Edit shape"
            >
              ✎
            </button>

            <button
              className="text-muted-foreground hover:text-destructive transition-colors p-0.5 shrink-0"
              onClick={() => handleDeleteShape(shape.id)}
              title="Delete shape"
            >
              ×
            </button>
          </div>
        );
      })}

      {shapes.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No shape keys. Click + to add one.
        </p>
      )}
    </div>
  );
}
