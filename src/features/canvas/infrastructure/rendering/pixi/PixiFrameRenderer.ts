import {
  computeWorldMatrices,
  decomposeAffineMatrix,
} from "@/domain/transforms";

import { applyNodeTransformToPixiDisplayObject } from "./pixiTransform.js";

import type { PixiResourceRegistry } from "./PixiResourceRegistry.js";
import type { PixiViewportBridge } from "./PixiViewportBridge.js";
import type {
  CanvasFrame,
  DrawFrameOptions,
} from "../../../application/canvasRenderer.types.js";
import type { Container } from "pixi.js";

interface PixiFrameRendererOptions {
  resources: PixiResourceRegistry;
  contentLayer: Container;
  viewportBridge: PixiViewportBridge;
}

export class PixiFrameRenderer {
  resources: PixiResourceRegistry;
  private readonly contentLayer: Container;
  private readonly viewportBridge: PixiViewportBridge;
  private drawnPartIds = new Set<string>();
  private maskedSourceIds = new Set<string>();

  constructor({
    resources,
    contentLayer,
    viewportBridge,
  }: PixiFrameRendererOptions) {
    this.resources = resources;
    this.contentLayer = contentLayer;
    this.viewportBridge = viewportBridge;
  }

  drawFrame(frame: CanvasFrame, options: DrawFrameOptions = {}): boolean {
    const { project, view } = frame;
    const nodes = frame.effectiveNodes ?? project.nodes;
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const worldMatrices = computeWorldMatrices(nodes);

    if (view && this.viewportBridge) {
      const current = this.viewportBridge.readEditorView();
      if (
        current.zoom !== view.zoom ||
        current.panX !== view.panX ||
        current.panY !== view.panY
      ) {
        this.viewportBridge.applyEditorView(view);
      }
    }

    const currentPartIds = new Set<string>();
    const currentMaskedSourceIds = new Set<string>();

    for (const node of nodes) {
      if (node.type !== "part") continue;

      const mesh = this.resources.meshesByPartId.get(node.id);
      if (!mesh) {
        this._clearMaskForSource(node.id);
        continue;
      }

      if (node.visible === false) {
        this._clearMaskForSource(node.id);
        continue;
      }

      currentPartIds.add(node.id);

      if (!mesh.parent) {
        this.contentLayer.addChild(mesh);
      }

      mesh.visible = true;
      mesh.alpha = node.opacity ?? 1;

      const worldMatrix = worldMatrices.get(node.id);
      const renderTransform =
        node.parent && worldMatrix
          ? decomposeAffineMatrix(worldMatrix, { pivotX: 0, pivotY: 0 })
          : node.transform;
      applyNodeTransformToPixiDisplayObject(mesh, renderTransform);

      mesh.zIndex = node.draw_order ?? 0;

      const targetNode = node.clipToPartId
        ? nodesById.get(node.clipToPartId)
        : null;
      if (
        !targetNode ||
        targetNode.type !== "part" ||
        targetNode.id === node.id
      ) {
        this._clearMaskForSource(node.id);
        continue;
      }

      const maskMesh = this.resources.ensureMaskMesh(node.id, targetNode.id);
      if (!maskMesh) {
        this._clearMaskForSource(node.id);
        continue;
      }

      if (!maskMesh.parent) {
        this.contentLayer.addChild(maskMesh);
      }

      maskMesh.visible = targetNode.visible !== false;
      maskMesh.alpha = targetNode.opacity ?? 1;
      maskMesh.zIndex = targetNode.draw_order ?? 0;
      const maskWorldMatrix = worldMatrices.get(targetNode.id);
      const maskTransform =
        targetNode.parent && maskWorldMatrix
          ? decomposeAffineMatrix(maskWorldMatrix, { pivotX: 0, pivotY: 0 })
          : targetNode.transform;
      applyNodeTransformToPixiDisplayObject(maskMesh, maskTransform);

      if (typeof mesh.setMask === "function") {
        mesh.setMask({ mask: maskMesh, channel: "alpha" });
      } else {
        mesh.mask = maskMesh;
      }
      currentMaskedSourceIds.add(node.id);
    }

    this.contentLayer.sortableChildren = true;

    for (const partId of this.drawnPartIds) {
      if (!currentPartIds.has(partId)) {
        const mesh = this.resources.meshesByPartId.get(partId);
        if (mesh && mesh.parent === this.contentLayer) {
          this.contentLayer.removeChild(mesh);
        }
        this._clearMaskForSource(partId);
      }
    }

    for (const sourceNodeId of this.maskedSourceIds) {
      if (!currentMaskedSourceIds.has(sourceNodeId)) {
        this._clearMaskForSource(sourceNodeId);
      }
    }

    this.drawnPartIds = currentPartIds;
    this.maskedSourceIds = currentMaskedSourceIds;

    return !options.skipRender;
  }

  dispose(): void {
    for (const sourceNodeId of this.maskedSourceIds) {
      this._clearMaskForSource(sourceNodeId);
    }
    this.drawnPartIds.clear();
    this.maskedSourceIds.clear();
  }

  private _clearMaskForSource(sourceNodeId: string): void {
    const mesh = this.resources.meshesByPartId.get(sourceNodeId);
    if (mesh) {
      mesh.mask = null;
    }
    this.resources.disposeMaskMesh(sourceNodeId);
  }
}
