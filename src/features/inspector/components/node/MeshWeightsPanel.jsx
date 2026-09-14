import { useMeshWeightsController } from "@/features/inspector/application/useMeshInspectorController.js";
import {
  SectionTitle,
  InspectorRow,
} from "@/features/inspector/components/fields/InspectorRow.jsx";

import { Button } from "@/components/ui/button";

export function MeshWeightsPanel({ node: inspectedNode }) {
  const {
    bones,
    boneMap,
    boundBoneIds,
    autoWeightBoneIds,
    selectedBoneId,
    hasWeightPaintTargets,
    stats,
    selectBone: handleSelectBone,
    toggleAutoWeightBone: handleToggleAutoWeightBone,
    bindSelectedBone: handleBindSelectedBone,
    unbindSelectedBone: handleUnbindSelectedBone,
    applyAutomaticWeights: handleAutoWeights,
  } = useMeshWeightsController(inspectedNode);

  return (
    <div className="space-y-2 pt-1">
      <SectionTitle help="Owner attaches the layer. Checked influence bones deform its mesh. Auto Weights uses only checked bones.">
        Weights
      </SectionTitle>

      {!hasWeightPaintTargets && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {bones.length === 0
            ? "Add bones to paint weights."
            : "Select a bone to enable weight painting."}
        </p>
      )}

      {bones.length > 0 && (
        <div className="space-y-1">
          <InspectorRow label="Paint Bone">
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {boneMap.get(selectedBoneId)?.name ?? "—"}
            </span>
          </InspectorRow>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Check bones for Auto Weights. Dot = bone currently has vertex
            weights.
          </p>
          <div className="max-h-32 overflow-y-auto border border-border rounded p-1 space-y-0.5">
            {bones.map((bone) => {
              const bound = boundBoneIds.has(bone.id);
              const included = autoWeightBoneIds.has(bone.id);
              const selected = bone.id === selectedBoneId;
              return (
                <div
                  key={bone.id}
                  className={`
                    w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs
                    ${selected ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(event) =>
                      handleToggleAutoWeightBone(bone.id, event.target.checked)
                    }
                    aria-label={`Use ${bone.name} in Auto Weights`}
                    title="Include this bone in Auto Weights"
                    className="h-3.5 w-3.5 shrink-0 accent-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleSelectBone(bone.id)}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {bone.name}
                  </button>
                  {bound && (
                    <span
                      className={
                        selected ? "text-primary-foreground" : "text-primary"
                      }
                      aria-label={`${bone.name} has vertex weights`}
                      title="Has current vertex weights"
                    >
                      ●
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-xs"
          onClick={handleBindSelectedBone}
          disabled={!selectedBoneId || !stats?.unboundVertexCount}
          title="Assign this bone only to vertices that currently have no influences"
        >
          Bind Unweighted
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-xs"
          onClick={handleUnbindSelectedBone}
          disabled={!selectedBoneId || !boundBoneIds.has(selectedBoneId)}
        >
          Remove Influence
        </Button>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs"
        onClick={handleAutoWeights}
        disabled={autoWeightBoneIds.size === 0}
      >
        Auto Weights ({autoWeightBoneIds.size}{" "}
        {autoWeightBoneIds.size === 1 ? "bone" : "bones"})
      </Button>

      {stats && selectedBoneId && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <InspectorRow label="Bound Verts">
            {stats.boundVertexCount}
          </InspectorRow>
          <InspectorRow label="Unbound Verts">
            {stats.unboundVertexCount}
          </InspectorRow>
          <InspectorRow label="Selected Bone">
            {stats.selectedBoneVertexCount} verts &middot; avg{" "}
            {stats.averageWeight.toFixed(2)}
          </InspectorRow>
        </div>
      )}
    </div>
  );
}
