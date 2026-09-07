import type {
  MeshGenerationOptions,
  MeshGenerationResult,
} from "../../domain/mesh-generation/generate.types.js";

export interface MeshImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface MeshPayload {
  imageData: MeshImageData;
  opts?: MeshGenerationOptions;
}

interface MeshTaskRequest {
  requestId: string;
  kind?: "mesh.generate";
  projectRevision?: number;
  payload: MeshPayload;
}

interface LegacyMeshRequest extends MeshPayload {
  partId?: string;
}

export interface MeshData {
  ok: true;
  vertices: MeshGenerationResult["vertices"];
  uvs: Float32Array;
  triangles: MeshGenerationResult["triangles"];
  edgeIndices: number[];
}

export type MeshWorkerRequest = MeshTaskRequest | LegacyMeshRequest;
