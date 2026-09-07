import { Texture, MeshGeometry, Mesh } from "pixi.js";

import type { Vertex } from "@kukla2d/contracts";

import type {
  CanvasMeshData,
  CanvasTextureSource,
  RendererResourceRegistry,
} from "../../../application/canvasRenderer.types.js";
import type { Application, Container } from "pixi.js";

interface PixiResourceRegistryOptions {
  app: Application;
}

export class PixiResourceRegistry implements RendererResourceRegistry {
  readonly app: Application;
  readonly texturesByPartId = new Map<string, Texture>();
  readonly meshesByPartId = new Map<string, Mesh<MeshGeometry>>();
  readonly geometriesByPartId = new Map<string, MeshGeometry>();
  readonly containersByNodeId = new Map<string, Container>();
  readonly maskMeshesBySourceNodeId = new Map<string, Mesh<MeshGeometry>>();
  private readonly maskTargetByMesh = new WeakMap<Mesh<MeshGeometry>, string>();
  private disposed = false;

  constructor({ app }: PixiResourceRegistryOptions) {
    this.app = app;
  }

  hasTexture(partId: string): boolean {
    return this.texturesByPartId.has(partId);
  }

  hasMesh(partId: string): boolean {
    return this.meshesByPartId.has(partId);
  }

  uploadTexture(partId: string, image: CanvasTextureSource): void {
    this.assertActive();
    const old = this.texturesByPartId.get(partId);
    old?.destroy();

    const texture = Texture.from(image);
    this.texturesByPartId.set(partId, texture);

    const mesh = this.meshesByPartId.get(partId);
    if (mesh) {
      mesh.texture = texture;
    }

    this.syncMaskMeshesForTarget(partId);
  }

  uploadMesh(partId: string, meshData: CanvasMeshData): void {
    this.assertActive();
    const positions = new Float32Array(meshData.vertices.length * 2);
    for (let i = 0; i < meshData.vertices.length; i++) {
      const vertex = meshData.vertices[i];
      if (!vertex) throw new Error(`Missing vertex ${i} for part ${partId}`);
      positions[i * 2] = vertex.x;
      positions[i * 2 + 1] = vertex.y;
    }

    const uvs = new Float32Array(meshData.uvs);

    const indexArr =
      meshData.indices ??
      meshData.triangles?.flatMap((triangle) => triangle) ??
      [];
    const indices = new Uint32Array(indexArr);

    const oldMesh = this.meshesByPartId.get(partId);
    const oldGeometry = this.geometriesByPartId.get(partId);
    const geometry = new MeshGeometry({ positions, uvs, indices });
    this.geometriesByPartId.set(partId, geometry);

    const texture = this.texturesByPartId.get(partId) || Texture.WHITE;
    const mesh = new Mesh({ geometry, texture });
    this.meshesByPartId.set(partId, mesh);

    // Masks may share the old geometry. Point every live mask at the replacement
    // before releasing it, then remove the old renderable from the scene graph.
    this.syncMaskMeshesForTarget(partId);

    if (oldMesh?.parent) {
      oldMesh.parent.removeChild(oldMesh);
    }
    oldMesh?.destroy();
    oldGeometry?.destroy();
  }

  uploadQuadFallback(partId: string, w: number, h: number): void {
    this.uploadMesh(partId, {
      vertices: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      triangles: [
        [0, 1, 2],
        [0, 2, 3],
      ],
    });
  }

  uploadPositions(
    partId: string,
    vertices: Vertex[],
    uvs?: ArrayLike<number>,
  ): void {
    this.assertActive();
    const geometry = this.geometriesByPartId.get(partId);
    if (!geometry) return;

    const positions = geometry.positions;
    const vertexCount = vertices.length;

    if (vertexCount !== positions.length / 2) {
      this.uploadMesh(partId, {
        vertices,
        uvs: uvs ? Array.from(uvs) : [],
        triangles: this.getExistingTriangles(partId),
      });
      return;
    }

    for (let i = 0; i < vertexCount; i++) {
      const vertex = vertices[i];
      if (!vertex) throw new Error(`Missing vertex ${i} for part ${partId}`);
      positions[i * 2] = vertex.x;
      positions[i * 2 + 1] = vertex.y;
    }
    geometry.getBuffer("aPosition").update();

    if (uvs && uvs.length === vertexCount * 2) {
      const uvData = geometry.uvs;
      for (let i = 0; i < uvs.length; i++) {
        const uv = uvs[i];
        if (uv !== undefined) uvData[i] = uv;
      }
      geometry.getBuffer("aUV").update();
    }
  }

  private getExistingTriangles(partId: string): [number, number, number][] {
    const mesh = this.meshesByPartId.get(partId);
    if (!mesh) return [];
    const idx = mesh.geometry.getIndex();
    const indices = Array.from(idx.data);
    const triangles: [number, number, number][] = [];
    for (let index = 0; index + 2 < indices.length; index += 3) {
      const a = indices[index];
      const b = indices[index + 1];
      const c = indices[index + 2];
      if (a !== undefined && b !== undefined && c !== undefined)
        triangles.push([a, b, c]);
    }
    return triangles;
  }

  ensureMaskMesh(
    sourceNodeId: string,
    targetPartId: string,
  ): Mesh<MeshGeometry> | null {
    const targetMesh = this.meshesByPartId.get(targetPartId);
    if (!targetMesh) return null;

    const existing = this.maskMeshesBySourceNodeId.get(sourceNodeId);
    if (existing && this.maskTargetByMesh.get(existing) !== targetPartId) {
      this.disposeMaskMesh(sourceNodeId);
    }

    let maskMesh = this.maskMeshesBySourceNodeId.get(sourceNodeId);
    if (!maskMesh) {
      maskMesh = new Mesh({
        geometry: targetMesh.geometry,
        texture:
          targetMesh.texture ??
          this.texturesByPartId.get(targetPartId) ??
          Texture.WHITE,
      });
      this.maskMeshesBySourceNodeId.set(sourceNodeId, maskMesh);
    }

    maskMesh.geometry = targetMesh.geometry;
    maskMesh.texture =
      targetMesh.texture ??
      this.texturesByPartId.get(targetPartId) ??
      Texture.WHITE;
    this.maskTargetByMesh.set(maskMesh, targetPartId);

    return maskMesh;
  }

  disposeMaskMesh(sourceNodeId: string): void {
    const maskMesh = this.maskMeshesBySourceNodeId.get(sourceNodeId);
    if (!maskMesh) return;
    if (maskMesh.parent) {
      maskMesh.parent.removeChild(maskMesh);
    }
    maskMesh.destroy();
    this.maskMeshesBySourceNodeId.delete(sourceNodeId);
  }

  private syncMaskMeshesForTarget(targetPartId: string): void {
    const targetMesh = this.meshesByPartId.get(targetPartId);
    if (!targetMesh) return;

    for (const maskMesh of this.maskMeshesBySourceNodeId.values()) {
      if (this.maskTargetByMesh.get(maskMesh) !== targetPartId) continue;
      maskMesh.geometry = targetMesh.geometry;
      maskMesh.texture =
        targetMesh.texture ??
        this.texturesByPartId.get(targetPartId) ??
        Texture.WHITE;
    }
  }

  disposePart(partId: string): void {
    for (const [
      sourceNodeId,
      maskMesh,
    ] of this.maskMeshesBySourceNodeId.entries()) {
      if (
        sourceNodeId === partId ||
        this.maskTargetByMesh.get(maskMesh) === partId
      ) {
        this.disposeMaskMesh(sourceNodeId);
      }
    }

    const mesh = this.meshesByPartId.get(partId);
    mesh?.destroy();
    this.meshesByPartId.delete(partId);

    const geometry = this.geometriesByPartId.get(partId);
    geometry?.destroy();
    this.geometriesByPartId.delete(partId);

    const texture = this.texturesByPartId.get(partId);
    texture?.destroy();
    this.texturesByPartId.delete(partId);
  }

  disposeAll(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const maskMesh of this.maskMeshesBySourceNodeId.values()) {
      maskMesh.destroy();
    }
    this.maskMeshesBySourceNodeId.clear();

    for (const texture of this.texturesByPartId.values()) {
      texture.destroy();
    }
    this.texturesByPartId.clear();

    for (const geometry of this.geometriesByPartId.values()) {
      geometry.destroy();
    }
    this.geometriesByPartId.clear();

    for (const mesh of this.meshesByPartId.values()) {
      mesh.destroy();
    }
    this.meshesByPartId.clear();

    for (const container of this.containersByNodeId.values()) {
      container.destroy({ children: true });
    }
    this.containersByNodeId.clear();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Pixi resource registry is disposed");
  }
}
