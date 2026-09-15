import { 
  Trash2, 
  Clock, 
  Check, 
  FileArchive,
  Loader2,
  Pencil,
  Copy,
  Download,
  X
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { 
  listProjects, 
  deleteProject, 
  updateProjectName, 
  updateProjectAuthor,
  duplicateProject 
} from '@/io/projectDb.js';
import { buildProjectFileName } from '@/io/projectFormat.js';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.jsx";
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';


export function ProjectGallery({ onSelect, onProjectsLoaded, header, className = "" }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editingAuthorId, setEditingAuthorId] = useState(null);
  const [editAuthor, setEditAuthor] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const refreshProjects = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const p = await listProjects();
      setProjects(p);
      onProjectsLoaded?.(p);
    } catch (err) {
      console.error('Failed to list projects:', err);
      setLoadError('Unable to load saved projects. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [onProjectsLoaded]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const handleStartRename = (e, p) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  };

  const handleCancelRename = (e) => {
    if (e) e.stopPropagation();
    setEditingId(null);
    setEditName('');
  };

  const handleSaveRename = async (e) => {
    if (e) e.stopPropagation();
    if (!editName.trim()) return;
    try {
      await updateProjectName(editingId, editName.trim());
      setEditingId(null);
      refreshProjects();
    } catch (err) {
      console.error('Failed to rename project:', err);
    }
  };

  const handleStartAuthorEdit = (e, p) => {
    e.stopPropagation();
    setEditingAuthorId(p.id);
    setEditAuthor(p.author ?? '');
  };

  const handleCancelAuthorEdit = (e) => {
    if (e) e.stopPropagation();
    setEditingAuthorId(null);
    setEditAuthor('');
  };

  const handleSaveAuthor = async (e) => {
    if (e) e.stopPropagation();
    if (!editingAuthorId) return;
    try {
      await updateProjectAuthor(editingAuthorId, editAuthor.trim());
      setEditingAuthorId(null);
      await refreshProjects();
    } catch (err) {
      console.error('Failed to update project author:', err);
    }
  };

  const handleCopy = async (e, id) => {
    e.stopPropagation();
    try {
      await duplicateProject(id);
      refreshProjects();
    } catch (err) {
      console.error('Failed to copy project:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteProject(deleteId);
      setDeleteId(null);
      refreshProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const handleDownload = (e, p) => {
    e.stopPropagation();
    if (!p.blob) return;
    const url = URL.createObjectURL(p.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildProjectFileName(p.name);
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-4 gap-4 ${className}`}>
        {header}
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-4 gap-4 ${className}`}>
        {header}
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
          <p className="text-sm" role="alert">{loadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={refreshProjects}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-4 gap-4 ${className}`}>
        {header}
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
          <Clock className="h-10 w-10 mb-4 opacity-20" />
          <p className="text-sm font-medium">No saved projects yet</p>
          <p className="text-xs">Projects saved to library will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-4 gap-4 ${className}`}>
      {header}
      {projects.map((p) => (
        <div
          key={p.id}
          className="group relative flex flex-col bg-card border rounded-lg overflow-hidden cursor-pointer hover:border-primary transition-all shadow-sm hover:shadow-md"
          onClick={() => onSelect(p)}
        >
          {/* Thumbnail */}
          <div className="aspect-[4/3] bg-muted relative overflow-hidden flex items-center justify-center border-b">
            {p.thumbnail ? (
              <img 
                src={p.thumbnail} 
                alt={p.name} 
                className="w-full h-full object-contain"
              />
            ) : (
              <FileArchive className="h-12 w-12 opacity-10" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Check className="text-white h-8 w-8" />
            </div>
            
            {/* Quick Actions Overlay */}
            <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm"
                onClick={(e) => handleCopy(e, p.id)}
                title="Duplicate"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm"
                onClick={(e) => handleDownload(e, p)}
                title="Download .kk2d"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteId(p.id);
                }}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          
          {/* Info */}
          <div className="p-3 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {editingId === p.id ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <Input
                    className="h-7 text-xs px-2"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveRename}>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCancelRename}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1 group/title truncate">
                    <h3 className="text-xs font-semibold truncate leading-tight">{p.name}</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => handleStartRename(e, p)}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(p.updatedAt).toLocaleDateString()} · {new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </>
              )}
              {editingAuthorId === p.id ? (
                <div className="mt-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <span className="shrink-0 text-[10px] text-muted-foreground">Author:</span>
                  <Input
                    aria-label="Project author"
                    className="h-6 min-w-0 px-1.5 text-[10px]"
                    value={editAuthor}
                    onChange={e => setEditAuthor(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') void handleSaveAuthor();
                      if (e.key === 'Escape') handleCancelAuthorEdit();
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleSaveAuthor}>
                    <Check className="h-3 w-3 text-green-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleCancelAuthorEdit}>
                    <X className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="group/author mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="truncate">Author: {p.author || '—'}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover/author:opacity-100"
                    onClick={(e) => handleStartAuthorEdit(e, p)}
                    title="Edit author"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Delete Confirmation */}
      <AlertDialog 
        open={!!deleteId} 
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project from the library? This action 
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
