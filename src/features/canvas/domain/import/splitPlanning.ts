/**
 * Pure layer split planning.
 *
 * Splits replace one PSD layer with several parts. Descending index order keeps
 * later replacements from shifting earlier targets.
 */
interface SplittableLayer {
  name: string;
  [property: string]: unknown;
}

interface LayerSplitPiece {
  name?: string;
  tag?: string;
  [property: string]: unknown;
}
interface LayerSplit {
  mergedIdx: number;
  pieces?: readonly LayerSplitPiece[];
  _resolvedIds?: string[];
}
interface ApplyLayerSplitsInput {
  layers: readonly SplittableLayer[];
  partIds: readonly string[];
  splits: readonly LayerSplit[];
  createId: () => string;
}

export function applyLayerSplits({
  layers,
  partIds,
  splits,
  createId,
}: ApplyLayerSplitsInput): { layers: SplittableLayer[]; partIds: string[] } {
  const sorted = [...splits].sort(
    (a, b) => (b.mergedIdx ?? 0) - (a.mergedIdx ?? 0),
  );
  const newLayers = [...layers];
  const newPartIds = [...partIds];
  for (const split of sorted) {
    const idx = split.mergedIdx;
    if (idx < 0 || idx >= newLayers.length) continue;
    const orig = newLayers[idx];
    const baseId = newPartIds[idx];
    const pieces = (split.pieces ?? []).map((p) => ({
      ...orig,
      ...p,
      name: p.name ?? `${orig?.name ?? "Layer"} (${p.tag ?? "split"})`,
    }));
    const pieceIds = pieces.map(() => createId());
    newLayers.splice(idx, 1, ...pieces);
    newPartIds.splice(idx, 1, ...pieceIds);
    // Retain resolved IDs for the import orchestration step.
    split._resolvedIds = pieceIds;
    void baseId;
  }
  return { layers: newLayers, partIds: newPartIds };
}
