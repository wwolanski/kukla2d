import { useState } from "react";

import { useMeshInspectorController } from "@/features/inspector/application/useMeshInspectorController.js";
import {
  SectionTitle,
  InspectorRow,
} from "@/features/inspector/components/fields/InspectorRow.jsx";
import { SliderRow } from "@/features/inspector/components/fields/SliderRow.jsx";
import { MeshWeightsPanel } from "@/features/inspector/components/node/MeshWeightsPanel.jsx";

import { Button } from "@/components/ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.jsx";

export function MeshPanel({ node, onRemesh, onDeleteMesh }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemesh, setConfirmRemesh] = useState(false);
  const {
    options: opts,
    hasPerPartOptions,
    remeshImpact,
    isDestructiveRemesh,
    showRigWarning,
    setOption,
    enablePerPartOptions,
  } = useMeshInspectorController({ node });

  const handleDeleteMesh = () => {
    onDeleteMesh(node.id);
    setConfirmDelete(false);
  };

  const handleRemeshClick = () => {
    if (isDestructiveRemesh) {
      setConfirmRemesh(true);
    } else {
      onRemesh(node.id, opts);
    }
  };

  const handleConfirmRemesh = () => {
    onRemesh(node.id, opts);
    setConfirmRemesh(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionTitle help="Vertex mesh for deformation. Generate creates a triangulated grid; Edit Mode allows vertex sculpting and adjustment.">
          Mesh
        </SectionTitle>
        <div className="flex items-center gap-1">
          {node.mesh && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[10px]"
              onClick={() => setConfirmDelete(true)}
            >
              Delete Mesh
            </Button>
          )}
          {!node.mesh && !hasPerPartOptions && (
            <button
              onClick={enablePerPartOptions}
              className="text-[10px] text-primary underline-offset-2 hover:underline"
            >
              override
            </button>
          )}
        </div>
      </div>

      {node.mesh && (
        <div className="space-y-2">
          <div className="space-y-1">
            <InspectorRow label="Vertices">
              <span className="text-xs tabular-nums">
                {node.mesh?.vertices?.length ?? "—"}
              </span>
            </InspectorRow>
            <InspectorRow label="Triangles">
              <span className="text-xs tabular-nums">
                {node.mesh?.triangles?.length ?? "—"}
              </span>
            </InspectorRow>
          </div>
        </div>
      )}

      {node.mesh && <MeshWeightsPanel node={node} />}

      {!node.mesh && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          No mesh. Generate one to enable vertex editing and mesh warp
          animation.
        </p>
      )}

      {showRigWarning && (
        <p className="text-xs leading-relaxed rounded px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400">
          ⚠ Mesh was generated before rigging. Click <strong>Remesh</strong> to
          enable elbow/knee deformation.
        </p>
      )}

      <div className="space-y-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-0.5"
        >
          <span>{expanded ? "▼" : "▶"}</span>
          <span className="font-medium">Settings</span>
        </button>
        {expanded && (
          <div className="space-y-2 pl-2 border-l border-border/50">
            <SliderRow
              label="Alpha Threshold"
              value={opts.alphaThreshold}
              min={1}
              max={254}
              onChange={(v) => setOption("alphaThreshold", v)}
              help="Pixel opacity threshold (0–255). Higher = stricter boundary detection."
            />
            <SliderRow
              label="Smooth Passes"
              value={opts.smoothPasses}
              min={0}
              max={10}
              onChange={(v) => setOption("smoothPasses", v)}
              help="Laplacian smoothing iterations on the contour. Smooths jagged edges."
            />
            <SliderRow
              label="Grid Spacing"
              value={opts.gridSpacing}
              min={6}
              max={100}
              onChange={(v) => setOption("gridSpacing", v)}
              help="Distance between interior sample points. Lower = more vertices, higher detail."
            />
            <SliderRow
              label="Edge Padding"
              value={opts.edgePadding}
              min={0}
              max={40}
              onChange={(v) => setOption("edgePadding", v)}
              help="Minimum distance interior points must be from the boundary. Prevents clustering."
            />
            <SliderRow
              label="Edge Points"
              value={opts.numEdgePoints}
              min={8}
              max={300}
              onChange={(v) => setOption("numEdgePoints", v)}
              help="Number of points sampled along the contour. More = smoother outline."
            />
          </div>
        )}
      </div>

      <Button
        size="sm"
        className="w-full h-7 text-xs mt-1"
        onClick={handleRemeshClick}
      >
        {node.mesh ? "Remesh" : "Generate Mesh"}
      </Button>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>Delete Mesh?</DialogTitle>
          <DialogDescription>
            This will delete the mesh for &quot;{node.name || node.id}&quot;.
            You can undo this action.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteMesh}>
              Delete Mesh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRemesh} onOpenChange={setConfirmRemesh}>
        <DialogContent>
          <DialogTitle>Remesh will clear dependent data</DialogTitle>
          <DialogDescription>
            {remeshImpact && (
              <span className="space-y-1 block">
                {remeshImpact.blendShapeIds.length > 0 && (
                  <span className="block">
                    {remeshImpact.blendShapeIds.length} shape key(s) will be
                    removed.
                  </span>
                )}
                {remeshImpact.meshTrackAddresses.length > 0 && (
                  <span className="block">
                    {remeshImpact.meshTrackAddresses.length} mesh animation
                    track(s) will be removed.
                  </span>
                )}
                {remeshImpact.hasWeights && (
                  <span className="block">Vertex weights will be cleared.</span>
                )}
                <span className="block pt-1">You can undo this action.</span>
              </span>
            )}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemesh(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRemesh}>Remesh</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
