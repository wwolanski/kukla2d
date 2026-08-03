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
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CanvasDialogs({
  confirmWipeOpen, setConfirmWipeOpen, handleConfirmWipe, handleImportPsdToLibrary, canImportPendingPsdToLibrary,
  confirmDeleteOpen, setConfirmDeleteOpen, deleteIntent, handleConfirmDelete,
}) {
  const deleteDescription = deleteIntent
    ? `Delete ${deleteIntent.label}? This will remove the selected items and their animation tracks.${deleteIntent.counts.nodes > 0 ? ' Textures and library assets are preserved.' : ''}`
    : 'Delete selected items?';

  return (
    <>
      <AlertDialog open={confirmWipeOpen} onOpenChange={setConfirmWipeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wipe current project?</AlertDialogTitle>
            <AlertDialogDescription>
              Importing a new project or PSD will permanently delete all existing layers,
              meshes, and animations in your current project. This action
              cannot be undone.{canImportPendingPsdToLibrary && ' Or add PSD layers to Library without changing the current project.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {canImportPendingPsdToLibrary && (
              <Button type="button" variant="outline" onClick={handleImportPsdToLibrary}>
                Add to Library
              </Button>
            )}
            <AlertDialogAction onClick={handleConfirmWipe} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Wipe & Load
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete selected?</DialogTitle>
          <DialogDescription>{deleteDescription}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
