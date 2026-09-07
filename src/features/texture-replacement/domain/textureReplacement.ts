import type { PartNode, ProjectDocument, Texture } from "@kukla2d/contracts";

interface ImageDimensions {
  width: number;
  height: number;
}

interface TextureReplacementSource {
  nodeId: string;
  name: string;
  textureId: string;
  width?: number;
  height?: number;
}

interface TextureReplacementCandidate {
  textureId: string;
  name: string;
  width?: number;
  height?: number;
}

interface TextureReplacementPair {
  nodeId: string;
  textureId: string | null;
  enabled: boolean;
  reason?: "exact-name" | "similar-name" | "same-size";
}

interface TextureReplacementOptions {
  preserveDeformation: boolean;
  autoFit: boolean;
}

interface TextureReplacementResult {
  replacedNodeIds: string[];
  skippedNodeIds: string[];
}

const NAME_STOP_WORDS = new Set([
  "copy",
  "image",
  "img",
  "layer",
  "part",
  "texture",
  "tex",
]);

function normalizedName(value: string): string {
  return value
    .replace(/\.[a-z0-9]+$/i, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(value: string): Set<string> {
  return new Set(
    normalizedName(value)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !NAME_STOP_WORDS.has(token)),
  );
}

function tokenSimilarity(left: string, right: string): number {
  const a = nameTokens(left);
  const b = nameTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.max(a.size, b.size);
}

function sameSize(
  left: Pick<TextureReplacementSource, "width" | "height">,
  right: Pick<TextureReplacementCandidate, "width" | "height">,
): boolean {
  return (
    !!left.width &&
    !!left.height &&
    left.width === right.width &&
    left.height === right.height
  );
}

function matchScore(
  source: TextureReplacementSource,
  candidate: TextureReplacementCandidate,
): {
  score: number;
  reason?: TextureReplacementPair["reason"];
} {
  const sourceName = normalizedName(source.name);
  const candidateName = normalizedName(candidate.name);
  if (sourceName && sourceName === candidateName)
    return { score: 10_000, reason: "exact-name" };

  const similarity = tokenSimilarity(source.name, candidate.name);
  if (similarity > 0) {
    return {
      score:
        1_000 +
        Math.round(similarity * 100) +
        (sameSize(source, candidate) ? 20 : 0),
      reason: "similar-name",
    };
  }
  if (sameSize(source, candidate)) return { score: 100, reason: "same-size" };
  return { score: 0 };
}

/** Greedy, deterministic one-to-one matching: exact name, shared name tokens, dimensions. */
export function autoPairTextures(
  sources: readonly TextureReplacementSource[],
  candidates: readonly TextureReplacementCandidate[],
): TextureReplacementPair[] {
  const remaining = new Map(
    candidates.map((candidate) => [candidate.textureId, candidate]),
  );
  return sources.map((source) => {
    let best: TextureReplacementCandidate | null = null;
    let bestScore = 0;
    let bestReason: TextureReplacementPair["reason"];
    for (const candidate of remaining.values()) {
      const { score, reason } = matchScore(source, candidate);
      if (
        score > bestScore ||
        (score === bestScore &&
          best &&
          candidate.name.localeCompare(best.name) < 0)
      ) {
        best = candidate;
        bestScore = score;
        bestReason = reason;
      }
    }
    if (!best || bestScore === 0)
      return { nodeId: source.nodeId, textureId: null, enabled: false };
    remaining.delete(best.textureId);
    return {
      nodeId: source.nodeId,
      textureId: best.textureId,
      enabled: true,
      ...(bestReason ? { reason: bestReason } : {}),
    };
  });
}

export function collectTextureReplacementSources(
  project: ProjectDocument,
): TextureReplacementSource[] {
  return project.nodes
    .filter((node): node is PartNode => node.type === "part")
    .filter((node) =>
      project.textures.some(
        (texture) => texture.id === (node.textureId ?? node.id),
      ),
    )
    .sort((left, right) => right.draw_order - left.draw_order)
    .map((node) => ({
      nodeId: node.id,
      name: node.name || node.id,
      textureId: node.textureId ?? node.id,
      ...(node.imageWidth === undefined ? {} : { width: node.imageWidth }),
      ...(node.imageHeight === undefined ? {} : { height: node.imageHeight }),
    }));
}

export function collectTextureReplacementCandidates(
  project: ProjectDocument,
): TextureReplacementCandidate[] {
  const usedTextureIds = new Set(
    collectTextureReplacementSources(project).map((source) => source.textureId),
  );
  return project.textures
    .filter((texture) => !usedTextureIds.has(texture.id))
    .map((texture) => ({
      textureId: texture.id,
      name: texture.name ?? texture.fileName ?? texture.id,
    }));
}

function clearMeshDependencies(project: ProjectDocument, node: PartNode): void {
  node.mesh = null;
  node.blendShapes = [];
  node.blendShapeValues = {};
  const defaultPose = project.defaultPose?.[node.id];
  if (defaultPose && "mesh_verts" in defaultPose) delete defaultPose.mesh_verts;
  for (const animation of project.animations ?? []) {
    animation.tracks = (animation.tracks ?? []).filter(
      (track) => track.targetId !== node.id || track.property !== "mesh_verts",
    );
  }
}

function updateNativeImageFrame(
  node: PartNode,
  dimensions: ImageDimensions,
): void {
  node.imageWidth = dimensions.width;
  node.imageHeight = dimensions.height;
  node.imageBounds = {
    minX: 0,
    minY: 0,
    maxX: dimensions.width,
    maxY: dimensions.height,
  };
  node.alphaContours = [];
}

/** Mutates project draft. Caller owns transaction/history boundary. */
export function applyTextureReplacements(
  project: ProjectDocument,
  pairs: readonly TextureReplacementPair[],
  dimensions: ReadonlyMap<string, ImageDimensions>,
  options: TextureReplacementOptions,
): TextureReplacementResult {
  const textureIds = new Set<string>(
    project.textures.map((texture: Texture) => texture.id),
  );
  const nodeMap = new Map<string, ProjectDocument["nodes"][number]>(
    project.nodes.map((node) => [node.id, node]),
  );
  const replacedNodeIds: string[] = [];
  const skippedNodeIds: string[] = [];

  for (const pair of pairs) {
    if (!pair.enabled || !pair.textureId) continue;
    const node = nodeMap.get(pair.nodeId);
    const nextDimensions = dimensions.get(pair.textureId);
    if (
      node?.type !== "part" ||
      !textureIds.has(pair.textureId) ||
      !nextDimensions
    ) {
      skippedNodeIds.push(pair.nodeId);
      continue;
    }
    const currentTextureId = node.textureId ?? node.id;
    if (currentTextureId === pair.textureId) continue;

    node.textureId = pair.textureId;
    node.alphaContours = [];
    if (!options.preserveDeformation) clearMeshDependencies(project, node);
    if (!options.autoFit || !node.imageWidth || !node.imageHeight) {
      updateNativeImageFrame(node, nextDimensions);
    }
    replacedNodeIds.push(node.id);
  }

  return { replacedNodeIds, skippedNodeIds };
}
