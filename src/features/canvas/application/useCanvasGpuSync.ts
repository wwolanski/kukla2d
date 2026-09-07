import { useEffect } from "react";

import type { ProjectDocument } from "@kukla2d/contracts";

import type { ProjectVersionControl } from "@/store/project/projectStoreTypes.types.js";

import type {
  CanvasSceneGateway,
  CanvasTextureCache,
  MutableRef,
} from "./canvasApplication.types.js";

interface CanvasGpuSyncArgs {
  sceneGatewayRef: MutableRef<CanvasSceneGateway | null>;
  projectRef: MutableRef<ProjectDocument>;
  textureCache: CanvasTextureCache;
  isDirtyRef: MutableRef<boolean>;
  project: ProjectDocument;
  versionControl: ProjectVersionControl;
}

export function useCanvasGpuSync({
  sceneGatewayRef,
  projectRef,
  textureCache,
  isDirtyRef,
  project,
  versionControl,
}: CanvasGpuSyncArgs): void {
  useEffect(() => {
    const gateway = sceneGatewayRef.current;
    if (!gateway) return;

    for (const node of project.nodes) {
      if (node.type !== "part") continue;

      const textureId = node.textureId ?? node.id;
      const texEntry = project.textures.find(
        (texture) => texture.id === textureId,
      );
      if (texEntry) {
        const isUploaded = gateway.hasTexture(node.id);
        const lastSource = textureCache.__internal.lastUploadedSources.get(
          node.id,
        );
        const sourceChanged = lastSource !== texEntry.source;

        if (!isUploaded || sourceChanged) {
          const sourceToUpload = texEntry.source;
          const img = new Image();
          img.onload = () => {
            if (sceneGatewayRef.current) {
              const currentTex = projectRef.current.textures.find(
                (texture) => texture.id === textureId,
              );
              if (currentTex?.source === sourceToUpload) {
                sceneGatewayRef.current.uploadTexture(node.id, img);
                textureCache.__internal.lastUploadedSources.set(
                  node.id,
                  sourceToUpload,
                );

                const off = document.createElement("canvas");
                off.width = img.width;
                off.height = img.height;
                const ctx = off.getContext("2d");
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  textureCache.__internal.imageDataByPartId.set(
                    node.id,
                    ctx.getImageData(0, 0, img.width, img.height),
                  );
                }

                isDirtyRef.current = true;
              }
            }
          };
          img.src = sourceToUpload;
        }
      }

      if (!gateway.hasMesh(node.id)) {
        if (node.mesh) {
          gateway.uploadMesh(node.id, node.mesh);
          isDirtyRef.current = true;
        } else if (node.imageWidth && node.imageHeight) {
          gateway.uploadQuadFallback(
            node.id,
            node.imageWidth,
            node.imageHeight,
          );
          isDirtyRef.current = true;
        }
      }
    }
  }, [project.nodes, project.textures, versionControl?.textureVersion]);
}
