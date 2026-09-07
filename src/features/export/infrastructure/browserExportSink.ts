import type { ExportArtifact } from "@kukla2d/contracts";

import type { ExportOutputSink } from "../application/exportApplicationTypes.types.js";

type BrowserExportDestination = "download" | "folder" | "zip";

interface FileSystemWritableFileStreamLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

interface FileSystemDirectoryHandleLike {
  getDirectoryHandle(
    name: string,
    options: { create: true },
  ): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<FileSystemFileHandleLike>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker(options: {
    mode: "readwrite";
  }): Promise<FileSystemDirectoryHandleLike>;
}

function hasDirectoryPicker(value: Window): value is DirectoryPickerWindow {
  return (
    typeof (value as Partial<DirectoryPickerWindow>).showDirectoryPicker ===
    "function"
  );
}

export async function browserExportSink(
  artifacts: readonly ExportArtifact[],
  {
    destination = "download",
    projectName = "export",
  }: { destination?: BrowserExportDestination; projectName?: string } = {},
): ReturnType<ExportOutputSink> {
  if (artifacts.length === 0) return { ok: true };

  for (const artifact of artifacts) {
    validateArtifact(artifact);
  }

  if (artifacts.length === 1 && destination === "download") {
    const art = artifacts[0]!;
    const url = URL.createObjectURL(art.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = art.fileName;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  }

  if (destination === "folder") {
    return exportToFolder(artifacts);
  }

  return exportToZip(artifacts, projectName);
}

async function exportToFolder(
  artifacts: readonly ExportArtifact[],
): ReturnType<ExportOutputSink> {
  let dirHandle: FileSystemDirectoryHandleLike;
  try {
    if (!hasDirectoryPicker(window)) {
      return {
        ok: false,
        error: {
          code: "FOLDER_PICKER_UNAVAILABLE",
          message: "Directory picker is unavailable",
        },
      };
    }
    dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (error) {
    if (isUserCancellation(error)) return { ok: false, cancelled: true };
    return { ok: false, error: exportFailure("FOLDER_PICKER_FAILED", error) };
  }

  try {
    for (const art of artifacts) {
      const pathParts = validateArtifactPath(
        art.relativePath ?? art.fileName,
      ).split("/");
      let currentHandle = dirHandle;

      for (let i = 0; i < pathParts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]!, {
          create: true,
        });
      }

      const fileName = pathParts[pathParts.length - 1]!;
      const fileHandle = await currentHandle.getFileHandle(fileName, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(art.blob);
      await writable.close();
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: exportFailure("FOLDER_WRITE_FAILED", error) };
  }
}

async function exportToZip(
  artifacts: readonly ExportArtifact[],
  projectName: string,
): ReturnType<ExportOutputSink> {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    for (const art of artifacts) {
      const content =
        art.blob instanceof Blob ? await art.blob.arrayBuffer() : art.blob;
      zip.file(validateArtifactPath(art.relativePath ?? art.fileName), content);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeZipName(projectName)}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    return { ok: true };
  } catch (error) {
    return { ok: false, error: exportFailure("ZIP_EXPORT_FAILED", error) };
  }
}

function sanitizeZipName(name: string): string {
  return (
    (name || "export")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "export"
  );
}

function isUserCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function exportFailure(
  code: string,
  error: unknown,
): { code: string; message: string } {
  const detail = error instanceof Error ? error.message : String(error);
  return { code, message: `Export failed: ${detail}` };
}

function validateArtifact(
  artifact: unknown,
): asserts artifact is ExportArtifact {
  if (!artifact || typeof artifact !== "object") {
    throw new TypeError("browserExportSink: artifact must be an object");
  }
  const candidate = artifact as Partial<ExportArtifact>;
  validateArtifactPath(candidate.fileName);
  if (candidate.relativePath != null)
    validateArtifactPath(candidate.relativePath);
  if (!(candidate.blob instanceof Blob)) {
    throw new TypeError("browserExportSink: artifact blob is required");
  }
}

function validateArtifactPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new TypeError(
      "browserExportSink: artifact path must be a safe relative path",
    );
  }
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
    throw new TypeError("browserExportSink: artifact path must be relative");
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new TypeError(
      "browserExportSink: artifact path contains an unsafe segment",
    );
  }
  return segments.join("/");
}
