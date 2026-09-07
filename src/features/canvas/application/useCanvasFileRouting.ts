import { useCallback } from "react";

import { hasProjectFileExtension } from "@/io/projectFormat";

import { handleCanvasDrop } from "./handleCanvasDrop.js";

import type { CanvasDropEvent } from "./handleCanvasDrop.types.js";
import type { WorkflowEvent } from "../domain/workflowContracts.types.js";
import type { ChangeEvent, DragEvent } from "react";

interface CanvasFileRoutingArgs {
  importPng: (file: File) => Promise<void>;
  importPsdFile: (file: File) => Promise<void>;
  importStretchFile: (file: File) => Promise<void>;
  placeLibraryAsset: (
    assetId: string,
    event: CanvasDropEvent,
  ) => Promise<unknown>;
  sendWorkflowEvent?: (event: WorkflowEvent) => void;
  notifyError: (error: unknown) => void;
}

interface CanvasFileRouting {
  importFiles: (fileList: FileList | readonly File[] | null) => Promise<void>;
  onDrop: (event: DragEvent<HTMLElement>) => Promise<void>;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export function useCanvasFileRouting({
  importPng,
  importPsdFile,
  importStretchFile,
  placeLibraryAsset,
  sendWorkflowEvent,
  notifyError,
}: CanvasFileRoutingArgs): CanvasFileRouting {
  const importFiles = useCallback(
    async (fileList: FileList | readonly File[] | null): Promise<void> => {
      try {
        for (const file of Array.from(fileList ?? [])) {
          if (hasProjectFileExtension(file.name)) await importStretchFile(file);
          else if (file.name.toLowerCase().endsWith(".psd"))
            await importPsdFile(file);
          else if (file.type.startsWith("image/")) await importPng(file);
        }
      } catch (error) {
        notifyError(error);
      }
    },
    [importPng, importPsdFile, importStretchFile, notifyError],
  );
  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) =>
      handleCanvasDrop({
        event,
        importFiles,
        placeLibraryAsset,
        ...(sendWorkflowEvent === undefined ? {} : { sendWorkflowEvent }),
      }),
    [importFiles, placeLibraryAsset, sendWorkflowEvent],
  );
  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      try {
        await importFiles(event.target.files);
      } finally {
        event.target.value = "";
      }
    },
    [importFiles],
  );
  return { importFiles, onDrop, handleFileChange };
}
