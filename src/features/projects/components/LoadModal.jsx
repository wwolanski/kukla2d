import { Files, FolderOpen, LoaderCircle, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { hasProjectFileExtension } from "@/io/projectFormat";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ProjectGallery } from "./ProjectGallery.jsx";

export function LoadModalView({
  externalImportFormats,
  importExternalProject,
  open,
  onOpenChange,
  onLoadFromDb,
  onLoadFromFile,
}) {
  const fileInputRef = useRef(null);
  const externalFilesRef = useRef(null);
  const externalFolderRef = useRef(null);
  const [externalError, setExternalError] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && hasProjectFileExtension(file.name)) {
      onLoadFromFile(file);
      onOpenChange(false);
    }
  };

  const handleExternalFiles = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setExternalError(null);
    setIsImporting(true);
    try {
      const projectFile = await importExternalProject(files);
      onLoadFromFile(projectFile);
      onOpenChange(false);
    } catch (error) {
      setExternalError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle>Load Project</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="library" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 py-3 border-b bg-muted/10 shrink-0">
            <TabsList className="grid w-full max-w-sm grid-cols-2">
              <TabsTrigger value="library">Project Library</TabsTrigger>
              <TabsTrigger value="external">External Import</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="library" className="mt-0 flex-1 min-h-0">
            <ScrollArea className="h-full">
              <ProjectGallery
                header={
                  <div
                    className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group aspect-[4/3] bg-muted/20"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Plus className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-xs font-semibold">Import Project</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Select .kk2d file
                    </p>
                    <input
                      type="file"
                      accept=".kk2d"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                }
                onSelect={(p) => {
                  onLoadFromDb(p);
                  onOpenChange(false);
                }}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="external"
            className="mt-0 flex-1 p-6 overflow-auto"
          >
            <div className="mx-auto max-w-2xl space-y-5">
              <div>
                <h2 className="text-sm font-semibold">BrashMonkey Spriter</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Import one .scml project with all referenced image files.
                  Sprites, bones, draw order, opacity, and animations become
                  editable Kukla2D data.
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Supported:{" "}
                  {externalImportFormats
                    .map((format) => format.label)
                    .join(", ")}
                </p>
              </div>

              <button
                type="button"
                disabled={isImporting}
                onClick={() => externalFolderRef.current?.click()}
                className="w-full min-h-44 rounded-lg border-2 border-dashed bg-muted/20 p-6 flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 disabled:opacity-60 disabled:pointer-events-none transition-colors"
              >
                {isImporting ? (
                  <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <FolderOpen className="h-8 w-8 text-primary" />
                )}
                <span className="mt-3 text-sm font-semibold">
                  {isImporting
                    ? "Importing project…"
                    : "Select Spriter project folder"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  Recommended: folder containing .scml and images
                </span>
              </button>

              <button
                type="button"
                disabled={isImporting}
                onClick={() => externalFilesRef.current?.click()}
                className="w-full rounded-md border px-4 py-3 flex items-center justify-center gap-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                <Files className="h-4 w-4" />
                Select .scml and image files manually
              </button>

              {externalError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
                >
                  {externalError}
                </div>
              )}

              <input
                type="file"
                ref={externalFolderRef}
                onChange={handleExternalFiles}
                className="hidden"
                webkitdirectory=""
                multiple
              />
              <input
                type="file"
                ref={externalFilesRef}
                onChange={handleExternalFiles}
                className="hidden"
                accept=".scml,image/png,image/jpeg,image/webp"
                multiple
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
