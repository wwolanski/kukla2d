import type { Mesh, ProjectDocument } from "@kukla2d/contracts";

export interface ResourceRegistry {
  disposeAll(): void;
}

export interface WorkspaceLoadStage {
  project: ProjectDocument;
  stagedImageData: Map<string, ImageData>;
  stagedResources: {
    uploadTexture(partId: string, img: HTMLImageElement): void;
    uploadMesh(partId: string, mesh: Mesh): void;
    uploadQuadFallback(partId: string, width: number, height: number): void;
    commit(): ResourceRegistry;
    dispose(): void;
    resources: ResourceRegistry;
  } | null;
}
