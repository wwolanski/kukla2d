import type {
  MeshData,
  MeshImageData,
  MeshWorkerRequest,
} from "./workerProtocol.types.js";
import type {
  MeshGenerationOptions,
  MeshGenerationResult,
} from "../../domain/mesh-generation/generate.types.js";

type MeshTaskRequest = Extract<MeshWorkerRequest, { requestId: string }>;
type MeshTaskResponse =
  | {
      type: "result";
      data: { requestId: string; projectRevision?: number; data: MeshData };
    }
  | {
      type: "error";
      data: {
        requestId: string;
        code: "MESH_GENERATION_FAILED";
        message: string;
        retryable: false;
      };
    };
type MeshWorkerResponse =
  MeshTaskResponse | MeshData | { ok: false; error: string };
type GenerateMesh = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts?: MeshGenerationOptions,
) => MeshGenerationResult;

interface MeshTaskResult {
  response: MeshWorkerResponse;
  transferables: Transferable[];
}

function isTaskRequest(request: MeshWorkerRequest): request is MeshTaskRequest {
  return "requestId" in request && typeof request.requestId === "string";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function handleMeshTask(
  eventData: MeshWorkerRequest | null | undefined,
  dependencies: { generateMesh?: GenerateMesh },
): MeshTaskResult {
  if (!eventData) {
    return { response: { ok: false, error: "no data" }, transferables: [] };
  }

  const taskRequest = isTaskRequest(eventData);
  const requestId = taskRequest ? eventData.requestId : undefined;
  const projectRevision = taskRequest ? eventData.projectRevision : undefined;
  const {
    imageData,
    opts,
  }: { imageData: MeshImageData; opts?: MeshGenerationOptions } = taskRequest
    ? eventData.payload
    : eventData;

  try {
    if (!dependencies.generateMesh)
      throw new Error("generateMesh dependency is required");
    const result = dependencies.generateMesh(
      imageData.data,
      imageData.width,
      imageData.height,
      opts,
    );
    const data: MeshData = {
      ok: true,
      vertices: result.vertices,
      uvs: result.uvs,
      triangles: result.triangles,
      edgeIndices: Array.from(result.edgeIndices),
    };
    const response: MeshWorkerResponse = taskRequest
      ? {
          type: "result",
          data: {
            requestId: requestId!,
            ...(projectRevision === undefined ? {} : { projectRevision }),
            data,
          },
        }
      : data;
    return { response, transferables: [result.uvs.buffer] };
  } catch (error) {
    const message = errorMessage(error);
    return {
      response: taskRequest
        ? {
            type: "error",
            data: {
              requestId: requestId!,
              code: "MESH_GENERATION_FAILED",
              message,
              retryable: false,
            },
          }
        : { ok: false, error: message },
      transferables: [],
    };
  }
}
