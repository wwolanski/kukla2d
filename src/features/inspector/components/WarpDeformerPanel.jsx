import { Grid2x2 } from "lucide-react";

import { useWarpDeformerController } from "@/features/inspector/application/useWarpDeformerController.js";

import { Button } from "@/components/ui/button";
import { HelpIcon } from "@/components/ui/help-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Inspector panel for warpDeformer nodes.
 *
 * Shows the grid dimensions, bounding box, and parameter binding.
 * The actual lattice editing happens in the canvas overlay (GizmoOverlay)
 * when the warp deformer is selected.
 */
export function WarpDeformerPanel({ node }) {
  const {
    editorMode,
    activeAnimationId,
    update,
    fitToChildren,
    resetLattice,
    keyCurrentLattice,
  } = useWarpDeformerController(node);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Grid2x2 className="h-3.5 w-3.5" /> Warp Deformer
        <HelpIcon
          tip="Lattice deformer driven by a parameter. Adjust grid size and bounds, then drag control points in the canvas at each parameter value."
          side="left"
        />
      </div>

      {/* Grid dimensions */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Grid size (col × row control points)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            max="10"
            className="h-7 text-xs w-16"
            value={node.col ?? 2}
            onChange={(e) =>
              update({ col: Math.max(1, Math.min(10, Number(e.target.value))) })
            }
          />
          <span className="text-xs text-muted-foreground">×</span>
          <Input
            type="number"
            min="1"
            max="10"
            className="h-7 text-xs w-16"
            value={node.row ?? 2}
            onChange={(e) =>
              update({ row: Math.max(1, Math.min(10, Number(e.target.value))) })
            }
          />
          <span className="text-xs text-muted-foreground">
            = {((node.col ?? 2) + 1) * ((node.row ?? 2) + 1)} pts
          </span>
        </div>
      </div>

      {/* Bounding box */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Grid bounds (canvas px)
          </Label>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={fitToChildren}
            >
              Fit to children
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={resetLattice}
            >
              Reset lattice
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ["X", "gridX"],
            ["Y", "gridY"],
            ["W", "gridW"],
            ["H", "gridH"],
          ].map(([label, key]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground w-4">
                {label}
              </span>
              <Input
                type="number"
                className="h-6 text-xs flex-1"
                value={node[key] ?? 0}
                onChange={(e) => update({ [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
      </div>

      {editorMode === "animation" && activeAnimationId && (
        <Button
          variant="secondary"
          size="sm"
          className="h-6 text-[10px] px-2 w-full"
          onClick={keyCurrentLattice}
        >
          Key current lattice
        </Button>
      )}
    </div>
  );
}
