import { Loader2, Download, Library, AlertTriangle } from "lucide-react";

import { formatProjectError } from "@/io/projectErrorMessages";

import { useSaveProject } from "@/features/projects/application/useSaveProject.js";
import { ProjectGallery } from "@/features/projects/components/ProjectGallery.jsx";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatIssues(issues) {
  return issues.map((i) => `[${i.code}] ${i.path}: ${i.message}`).join("\n");
}

export function SaveModal({
  open,
  onOpenChange,
  project,
  captureRef,
  currentDbProjectId,
  currentDbProjectName,
  onSavedToDb,
  onSaveSuccess,
  publishSchemas,
}) {
  const {
    name,
    author,
    saveMode,
    isSaving,
    saveToSchemaDatabase,
    schemaEligibility,
    overwriteProject,
    preflightErrors,
    preflightWarnings,
    saveError,
    setName,
    setAuthor,
    setSaveMode,
    setSaveToSchemaDatabase,
    handleSaveNew,
    handleOverwrite,
    confirmOverwrite,
    continueAfterWarnings,
    setOverwriteProject,
    setPreflightErrors,
    setPreflightWarnings,
    setLibraryProjects,
    setSaveError,
  } = useSaveProject({
    open,
    project,
    captureRef,
    currentDbProjectId,
    currentDbProjectName,
    onSavedToDb,
    onSaveSuccess,
    onOpenChange,
    publishSchemas,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle>Save Project</DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="p-6 border-b bg-muted/20 shrink-0">
              <div className="flex flex-col gap-4 max-w-lg">
                <div className="grid gap-2">
                  <Label
                    htmlFor="name"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Project Name
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter project name..."
                      className="h-10"
                    />
                    <Button
                      onClick={handleSaveNew}
                      disabled={isSaving || !name.trim()}
                      className="shrink-0 h-10 px-6"
                    >
                      {isSaving && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save
                    </Button>
                  </div>
                  <div className="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="shrink-0">Author:</span>
                    <Input
                      aria-label="Project author"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="Add author"
                      className="h-7 border-0 bg-transparent px-1 text-xs text-foreground shadow-none focus-visible:ring-1"
                    />
                  </div>
                </div>

                <Tabs
                  value={saveMode}
                  onValueChange={setSaveMode}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 h-12">
                    <TabsTrigger
                      value="library"
                      className="flex items-center gap-2 text-sm font-medium h-10"
                    >
                      <Library className="h-4 w-4" />
                      Save to Library
                    </TabsTrigger>
                    <TabsTrigger
                      value="download"
                      className="flex items-center gap-2 text-sm font-medium h-10"
                    >
                      <Download className="h-4 w-4" />
                      Download File
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-start gap-3 rounded-md border bg-background p-3">
                  <Switch
                    id="save-project-schema-database"
                    checked={saveToSchemaDatabase}
                    disabled={!schemaEligibility.enabled || isSaving}
                    onCheckedChange={setSaveToSchemaDatabase}
                    aria-label="Save to schema database"
                    className="mt-0.5"
                  />
                  <label
                    htmlFor="save-project-schema-database"
                    className={schemaEligibility.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                  >
                    <span className="block text-xs font-medium">
                      Save to schema database
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                      {schemaEligibility.enabled
                        ? `${schemaEligibility.reason} Destination: local (indexedDB).`
                        : schemaEligibility.reason}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <ProjectGallery
                className="bg-muted/5"
                onSelect={handleOverwrite}
                onProjectsLoaded={setLibraryProjects}
              />
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!overwriteProject}
        onOpenChange={(open) => !open && setOverwriteProject(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Overwrite project?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to overwrite{" "}
              <strong>&quot;{overwriteProject?.name}&quot;</strong>? This will
              replace the project data and thumbnail in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmOverwrite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!preflightErrors}
        onOpenChange={(open) => !open && setPreflightErrors(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cannot save — project has errors
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <pre className="text-xs whitespace-pre-wrap max-h-60 overflow-auto text-destructive">
                {preflightErrors ? formatIssues(preflightErrors) : ""}
              </pre>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setPreflightErrors(null)}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!preflightWarnings}
        onOpenChange={(open) => !open && setPreflightWarnings(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Save warnings
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <pre className="text-xs whitespace-pre-wrap max-h-60 overflow-auto">
                {preflightWarnings ? formatIssues(preflightWarnings) : ""}
              </pre>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={continueAfterWarnings}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!saveError}
        onOpenChange={(open) => !open && setSaveError(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Save failed
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <pre className="text-xs whitespace-pre-wrap max-h-60 overflow-auto text-destructive">
                {saveError ? formatProjectError(saveError) : ""}
              </pre>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSaveError(null)}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
