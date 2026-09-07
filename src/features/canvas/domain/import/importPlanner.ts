/**
 * Pure PSD/PNG import planner.
 *
 * Builds a project-change plan without DOM, Worker, or store dependencies.
 */

/**
 * Plan a single PNG import without mutating project state.
 */
interface ImageBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ImportPlan {
  canvasPatch: { width: number; height: number };
  groupsToCreate: Array<{
    id: string;
    name: string;
    type: "group";
    boneRole: string | null;
    parent: string | null;
  }>;
  partsToCreate: Array<{
    id: string;
    name: string;
    type: "part";
    imageWidth: number;
    imageHeight: number;
    imageBounds: ImageBounds;
    draw_order: number;
    parent?: string | null;
    transform?: {
      pivotX: number;
      pivotY: number;
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      opacity: number;
      visible: boolean;
    };
  }>;
  texturesToCreate: Array<{ id: string; name: string; source: string }>;
  imageDataRequests: Array<{
    partId: string;
    kind: "full-canvas";
    width: number;
    height: number;
  }>;
}

interface ImportLayer {
  name: string;
  width: number;
  height: number;
  bounds?: ImageBounds | null;
  source?: string;
}
interface ImportGroupDefinition {
  id: string;
  name: string;
  role?: string | null;
  parent?: string | null;
}
interface ImportAssignment {
  drawOrder?: number;
  parentGroupId?: string | null;
}
interface PngImportInput {
  fileName: string;
  imageWidth: number;
  imageHeight: number;
  imageBounds?: ImageBounds | null;
  partId: string;
}
interface PsdImportInput {
  psdW: number;
  psdH: number;
  layers: readonly ImportLayer[];
  partIds: readonly string[];
  groupDefs?: readonly ImportGroupDefinition[];
  assignments?: readonly ImportAssignment[];
}

export function planPngImport({
  fileName,
  imageWidth,
  imageHeight,
  imageBounds,
  partId,
}: PngImportInput): ImportPlan {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return {
    canvasPatch: { width: imageWidth, height: imageHeight },
    groupsToCreate: [],
    partsToCreate: [
      {
        id: partId,
        name: baseName,
        type: "part",
        imageWidth,
        imageHeight,
        imageBounds: imageBounds ?? {
          minX: 0,
          minY: 0,
          maxX: imageWidth,
          maxY: imageHeight,
        },
        draw_order: 0,
      },
    ],
    texturesToCreate: [{ id: partId, name: `${baseName}.png`, source: "" }],
    imageDataRequests: [
      { partId, kind: "full-canvas", width: imageWidth, height: imageHeight },
    ],
  };
}

/** Build the final PSD import plan without mutating the supplied layer data. */
export function planPsdFinalize({
  psdW,
  psdH,
  layers,
  partIds,
  groupDefs = [],
  assignments = [],
}: PsdImportInput): ImportPlan {
  if (partIds.length !== layers.length) {
    throw new Error(
      `planPsdFinalize: layers/partIds length mismatch (${layers.length} vs ${partIds.length})`,
    );
  }
  const pivotX = psdW / 2;
  const pivotY = psdH / 2;
  return {
    canvasPatch: { width: psdW, height: psdH },
    groupsToCreate: groupDefs.map((g) => ({
      id: g.id,
      name: g.name,
      type: "group",
      boneRole: g.role ?? null,
      parent: g.parent ?? null,
    })),
    partsToCreate: layers.map((layer, i) => {
      const assignment = assignments[i] ?? {};
      return {
        id: partIds[i]!,
        name: layer.name,
        type: "part",
        imageWidth: layer.width,
        imageHeight: layer.height,
        imageBounds: layer.bounds ?? {
          minX: 0,
          minY: 0,
          maxX: layer.width,
          maxY: layer.height,
        },
        draw_order: assignment.drawOrder ?? layers.length - 1 - i,
        parent: assignment.parentGroupId ?? null,
        transform: {
          pivotX,
          pivotY,
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
        },
      };
    }),
    texturesToCreate: layers.map((layer, i) => ({
      id: partIds[i]!,
      name: layer.source ?? `${layer.name}.png`,
      source: "",
    })),
    imageDataRequests: layers.map((layer, i) => ({
      partId: partIds[i]!,
      kind: "full-canvas",
      width: layer.width,
      height: layer.height,
    })),
  };
}
