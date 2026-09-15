import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import type { PartNode, Texture } from "@kukla2d/contracts";

import { useEditorStore } from "@/store/editorStore.js";
import { useProjectStore } from "@/store/projectStore.js";

import {
  HOVER_SOURCE_PANEL,
  resolveVisibleHoverHit,
} from "@/domain/hoverPolicy.js";
import { writeLibraryAssetDrag } from "@/domain/libraryAssetDrag.js";
import {
  buildUniqueTextureNameMap,
  createUniqueName,
} from "@/domain/libraryAssetNames.js";
import { validateUniqueLibraryFolderName } from "@/domain/libraryFolderNames.js";

import { useWorkflowActor } from "@/features/canvas/index.js";
import { useDragSession } from "@/features/layers/application/useDragSession.js";
import { useLayerPanelBoneTreeDnD } from "@/features/layers/application/useLayerPanelBoneTreeDnD.js";
import { useLayerPanelDepthDnD } from "@/features/layers/application/useLayerPanelDepthDnD.js";
import { useLayerPanelSelection } from "@/features/layers/application/useLayerPanelSelection.js";
import { buildBoneTreeRows } from "@/features/layers/domain/buildBoneTreeRows.js";
import {
  buildLibraryTree,
  flattenLibraryTree,
} from "@/features/layers/domain/buildLibraryTree.js";
import type {
  DragTargetKind,
  DropPosition,
} from "@/features/layers/domain/dragSession.types.js";
import { removeLibraryAssets } from "@/features/layers/domain/removeLibraryAssets.js";

import { uid } from "@/lib/uid.js";

import { useToast } from "@/components/ui/use-toast.js";

interface LayerPanelControllerOptions {
  onImportClick?: () => void;
  onImportFiles?: (files: FileList) => void;
  onImportModularSprite?: (options?: {
    highlightFirstExample?: boolean;
  }) => void;
  onRegenerateModularSprite?: (
    id: string,
    options?: {
      includeAssetId?: string;
      removeAssetId?: string;
      force?: boolean;
      removeFromLibrary?: boolean;
    },
  ) => void;
  getDragImage?: () => HTMLCanvasElement | null;
}

type LibraryDragSource =
  { kind: "asset"; id: string } | { kind: "folder"; id: string };

function useLayerPanelControllerImpl(
  options: LayerPanelControllerOptions = {},
) {
  const {
    getDragImage,
    onImportClick,
    onImportFiles,
    onImportModularSprite,
    onRegenerateModularSprite,
  } = options;
  const {
    nodes,
    bones,
    constraints,
    textures,
    libraryFolders,
    assetPlacements,
    modularSprites,
    updateProject,
    duplicateNode,
    deleteNode,
    deleteSelectedBones,
  } = useProjectStore(
    useShallow((s) => ({
      nodes: s.project.nodes,
      bones: s.project.bones ?? [],
      constraints: s.project.constraints ?? [],
      textures: s.project.textures,
      libraryFolders: s.project.libraryFolders ?? [],
      assetPlacements: s.project.assetPlacements ?? [],
      modularSprites: s.project.modularSprites,
      updateProject: s.updateProject,
      duplicateNode: s.duplicateNode,
      deleteNode: s.deleteNode,
      deleteSelectedBones: s.deleteSelectedBones,
    })),
  );

  const {
    selection,
    hoverHit,
    hoverSource,
    setSelection,
    setHoverHit,
    activeBoneId,
    activeConstraintId,
    setActiveBoneId,
    setActiveConstraintId,
    setShowSkeleton,
    showSkeleton,
    activeLayerTab,
    setActiveLayerTab,
    expandedGroups,
    toggleGroupExpand,
    expandGroup,
    setExpandedGroups,
    editorMode,
  } = useEditorStore(
    useShallow((s) => ({
      selection: s.selection,
      hoverHit: s.hoverHit,
      hoverSource: s.hoverSource,
      setSelection: s.setSelection,
      setHoverHit: s.setHoverHit,
      activeBoneId: s.activeBoneId,
      activeConstraintId: s.activeConstraintId,
      setActiveBoneId: s.setActiveBoneId,
      setActiveConstraintId: s.setActiveConstraintId,
      setShowSkeleton: s.setShowSkeleton,
      showSkeleton: s.showSkeleton,
      activeLayerTab: s.activeLayerTab,
      setActiveLayerTab: s.setActiveLayerTab,
      expandedGroups: s.expandedGroups,
      toggleGroupExpand: s.toggleGroupExpand,
      expandGroup: s.expandGroup,
      setExpandedGroups: s.setExpandedGroups,
      editorMode: s.editorMode,
    })),
  );

  const { toast } = useToast();
  const { send } = useWorkflowActor();
  const setRiggingMode = useCallback(
    (riggingMode: string) => send({ type: "SET_RIGGING_MODE", riggingMode }),
    [send],
  );
  const setRiggingTool = useCallback(
    (riggingTool: string) => send({ type: "SET_RIGGING_TOOL", riggingTool }),
    [send],
  );
  const handleListHover = useCallback(
    (id: string) => {
      setHoverHit(id, HOVER_SOURCE_PANEL);
    },
    [setHoverHit],
  );
  const handleListHoverClear = useCallback(() => {
    setHoverHit(null);
  }, [setHoverHit]);

  const textureMap = useMemo(
    () =>
      new Map<string, Texture>(
        textures.map((texture) => [texture.id, texture]),
      ),
    [textures],
  );
  const visibleHoverValue: unknown = resolveVisibleHoverHit({
    selection,
    activeBoneId,
    activeConstraintId,
    hoverHit,
    hoverSource,
  });
  const visibleHoverHit =
    typeof visibleHoverValue === "string" ? visibleHoverValue : null;
  const depthNodes = useMemo(
    () =>
      [...nodes]
        .filter((node): node is PartNode => node.type === "part")
        .sort((a, b) => b.draw_order - a.draw_order),
    [nodes],
  );
  const boneExpandKeys = useMemo(
    () => bones.map((bone) => `bone:${bone.id}`),
    [bones],
  );
  const boneKeySignature = useMemo(
    () => boneExpandKeys.join("|"),
    [boneExpandKeys],
  );
  const previousBoneKeySignature = useRef("");
  const [showBoneImages, setShowBoneImages] = useState(true);

  useEffect(() => {
    if (
      !boneKeySignature ||
      previousBoneKeySignature.current === boneKeySignature
    )
      return;
    const current = useEditorStore.getState().expandedGroups;
    const next = new Set(current);
    for (const key of boneExpandKeys) next.add(key);
    setExpandedGroups(next);
    previousBoneKeySignature.current = boneKeySignature;
  }, [boneExpandKeys, boneKeySignature, setExpandedGroups]);

  const boneTreeRows = useMemo(
    () =>
      buildBoneTreeRows({
        bones,
        nodes,
        constraints,
        expanded: expandedGroups,
        showImages: showBoneImages,
      }),
    [bones, constraints, expandedGroups, nodes, showBoneImages],
  );
  const allBonesExpanded =
    boneExpandKeys.length > 0 &&
    boneExpandKeys.every((key) => expandedGroups.has(key));

  const toggleAllBoneRows = useCallback(() => {
    const nonBoneKeys = [...useEditorStore.getState().expandedGroups].filter(
      (key) => !String(key).startsWith("bone:"),
    );
    if (allBonesExpanded) {
      setExpandedGroups(nonBoneKeys);
      return;
    }
    setExpandedGroups([...nonBoneKeys, ...boneExpandKeys]);
  }, [allBonesExpanded, boneExpandKeys, setExpandedGroups]);

  const toggleBoneImages = useCallback(() => {
    setShowBoneImages((value) => !value);
  }, []);

  const {
    handleSelect,
    handleBoneSelect,
    handleConstraintSelect,
    createBoneFromCurrentSelection,
  } = useLayerPanelSelection({
    bones,
    nodes,
    boneTreeRows,
    selection,
    updateProject,
    setSelection,
    setActiveBoneId,
    setActiveConstraintId,
    setRiggingMode,
    setRiggingTool,
    setShowSkeleton,
    showSkeleton,
    send,
    expandGroup,
  });

  const {
    session: depthSession,
    onDragStart: onDragStartDepth,
    onDragOver: onDragOverDepth,
    onDrop: onDropDepth,
    toggleVisible,
    handleDeleteNode,
  } = useLayerPanelDepthDnD({
    nodes,
    selection,
    updateProject,
    deleteNode,
    setSelection,
    editorMode,
    getDragImage,
  });

  const {
    session: boneSession,
    onDragOver: onDragOverBone,
    toggleExpand,
    toggleNodeLink,
    unassignNode,
    detachBone,
    onBoneGroupDragStart,
    onBoneGroupDragEnd,
    onBoneGroupDrop,
  } = useLayerPanelBoneTreeDnD({
    updateProject,
    toggleGroupExpand,
    expandGroup,
    handleBoneSelect,
    editorMode,
    getDragImage,
  });

  const onRenameNode = useCallback(
    (nodeId: string, newName: string) => {
      updateProject((projectDraft) => {
        const node = projectDraft.nodes.find((n) => n.id === nodeId);
        if (node) node.name = newName;
      });
    },
    [updateProject],
  );

  const onRenameBone = useCallback(
    (boneId: string, newName: string) => {
      updateProject((projectDraft) => {
        const bone = (projectDraft.bones ?? []).find((b) => b.id === boneId);
        if (bone) bone.name = newName;
      });
    },
    [updateProject],
  );

  const onDeleteBone = useCallback(
    (boneId: string) => {
      if (editorMode === "animation") return;
      deleteSelectedBones([boneId]);
      if (activeBoneId === boneId) setActiveBoneId(null);
      if (selection.includes(boneId))
        setSelection(selection.filter((id) => id !== boneId));
      if (hoverHit === `bone:${boneId}`) setHoverHit(null);
    },
    [
      activeBoneId,
      deleteSelectedBones,
      editorMode,
      hoverHit,
      selection,
      setActiveBoneId,
      setHoverHit,
      setSelection,
    ],
  );

  const [libraryDragActive, setLibraryDragActive] = useState(false);

  const handleLibraryDragEnter = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setLibraryDragActive(true);
    },
    [],
  );

  const handleLibraryDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setLibraryDragActive(true);
    },
    [],
  );

  const handleLibraryDragLeave = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (
        !(e.relatedTarget instanceof globalThis.Node) ||
        !e.currentTarget.contains(e.relatedTarget)
      ) {
        setLibraryDragActive(false);
      }
    },
    [],
  );

  const handleLibraryDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setLibraryDragActive(false);
      onImportFiles?.(e.dataTransfer.files);
    },
    [onImportFiles],
  );

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleFolderExpand = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const libraryTree = useMemo(
    () =>
      buildLibraryTree({
        libraryFolders,
        assetPlacements,
        textures,
        nodes,
        modularSprites,
      }),
    [libraryFolders, assetPlacements, modularSprites, textures, nodes],
  );

  const libraryFlat = useMemo(
    () => flattenLibraryTree(libraryTree),
    [libraryTree],
  );

  const onCreateFolder = useCallback(() => {
    updateProject((projectDraft) => {
      if (!projectDraft.libraryFolders) projectDraft.libraryFolders = [];
      const folderName = createUniqueName(
        "New Folder",
        projectDraft.libraryFolders.map((folder) => folder.name),
      );
      projectDraft.libraryFolders.push({
        id: uid(),
        name: folderName,
        parentId: null,
        origin: "user",
      });
    });
  }, [updateProject]);

  const onRenameFolder = useCallback(
    (folderId: string, newName: string) => {
      try {
        updateProject((projectDraft) => {
          const folders = projectDraft.libraryFolders ?? [];
          const folder = folders.find((f) => f.id === folderId);
          if (!folder) return;
          const validatedName = validateUniqueLibraryFolderName(
            folders,
            newName,
            folderId,
          );
          folder.name = validatedName;
          const packageDocument = projectDraft.modularSprites.find((sprite) =>
            projectDraft.assetPlacements.some(
              (placement) =>
                placement.assetId === sprite.sourceAssetId &&
                placement.folderId === folderId,
            ),
          );
          if (packageDocument) {
            packageDocument.name = validatedName;
            const sourceTexture = projectDraft.textures.find(
              (texture) => texture.id === packageDocument.sourceAssetId,
            );
            if (sourceTexture)
              sourceTexture.name = `${validatedName} Source`;
          }
        });
      } catch (error) {
        toast({
          title: "Cannot rename library folder",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    },
    [toast, updateProject],
  );

  const onRenameLibraryAsset = useCallback(
    (assetId: string, newName: string) => {
      try {
        updateProject((projectDraft) => {
          const modularSprite = projectDraft.modularSprites.find(
            (candidate) => candidate.sourceAssetId === assetId,
          );
          if (modularSprite) {
            const placement = projectDraft.assetPlacements.find(
              (candidate) => candidate.assetId === assetId,
            );
            const folder = placement?.folderId
              ? projectDraft.libraryFolders.find(
                  (candidate) => candidate.id === placement.folderId,
                )
              : undefined;
            const validatedName = validateUniqueLibraryFolderName(
              projectDraft.libraryFolders,
              newName,
              folder?.id,
            );
            modularSprite.name = validatedName;
            const sourceTexture = projectDraft.textures.find(
              (candidate) => candidate.id === assetId,
            );
            if (sourceTexture)
              sourceTexture.name = `${validatedName} Source`;
            if (folder) folder.name = validatedName;
            return;
          }
          const existingNames = [
            ...buildUniqueTextureNameMap(
              projectDraft.textures,
              projectDraft.nodes,
            ).entries(),
          ]
            .filter(([textureId]) => textureId !== assetId)
            .map(([, name]) => name);
          const uniqueName = createUniqueName(newName, existingNames);
          const texture = projectDraft.textures.find(
            (candidate) => candidate.id === assetId,
          );
          if (texture) texture.name = uniqueName;
          const node = projectDraft.nodes.find((n) => n.id === assetId);
          if (node) node.name = uniqueName;
        });
      } catch (error) {
        toast({
          title: "Cannot rename library asset",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    },
    [toast, updateProject],
  );

  const onRemoveFromPackage = useCallback(
    (assetId: string) => {
      const packageDocument = modularSprites.find((sprite) =>
        sprite.parts.some((part) => part.assetId === assetId),
      );
      if (!packageDocument) return;
      onRegenerateModularSprite?.(packageDocument.id, {
        removeAssetId: assetId,
        force: true,
        removeFromLibrary: false,
      });
    },
    [modularSprites, onRegenerateModularSprite],
  );

  const onRemoveLibraryAsset = useCallback(
    (assetId: string) => {
      const packageDocument = modularSprites.find((sprite) =>
        sprite.parts.some((part) => part.assetId === assetId),
      );
      if (packageDocument) {
        setSelection([]);
        onRegenerateModularSprite?.(packageDocument.id, {
          removeAssetId: assetId,
          force: true,
          removeFromLibrary: true,
        });
        return;
      }
      updateProject((projectDraft) => {
        removeLibraryAssets(projectDraft, new Set([assetId]));
      });
      setSelection([]);
    },
    [modularSprites, onRegenerateModularSprite, setSelection, updateProject],
  );

  const onRemoveLibraryFolder = useCallback(
    (folderId: string) => {
      updateProject((projectDraft) => {
        const folderIds = new Set([folderId]);
        let foundDescendant = true;
        while (foundDescendant) {
          foundDescendant = false;
          for (const folder of projectDraft.libraryFolders ?? []) {
            if (
              folder.parentId &&
              folderIds.has(folder.parentId) &&
              !folderIds.has(folder.id)
            ) {
              folderIds.add(folder.id);
              foundDescendant = true;
            }
          }
        }
        const assetIds = new Set(
          (projectDraft.assetPlacements ?? [])
            .filter(
              (placement) =>
                placement.folderId && folderIds.has(placement.folderId),
            )
            .map((placement) => placement.assetId),
        );
        removeLibraryAssets(projectDraft, assetIds);
        projectDraft.libraryFolders = (
          projectDraft.libraryFolders ?? []
        ).filter((folder) => !folderIds.has(folder.id));
      });
      setSelection([]);
    },
    [setSelection, updateProject],
  );

  const {
    session: libraryDragSession,
    onDragStart: onLibraryDragStart,
    onDragOver: onLibraryDragOver,
    clearSession: clearLibraryDragSession,
  } = useDragSession(getDragImage);

  const libraryDragSourceRef = useRef<LibraryDragSource | null>(null);

  const handleLibraryDragStartAsset = useCallback(
    (e: React.DragEvent, assetId: string) => {
      libraryDragSourceRef.current = { kind: "asset", id: assetId };
      onLibraryDragStart(e, "libraryAsset", assetId);
      e.dataTransfer.effectAllowed = "copy";
      writeLibraryAssetDrag(e.dataTransfer, assetId);
    },
    [onLibraryDragStart, libraryDragSourceRef],
  );

  const handleLibraryDragStartFolder = useCallback(
    (e: React.DragEvent, folderId: string) => {
      libraryDragSourceRef.current = { kind: "folder", id: folderId };
      onLibraryDragStart(e, "libraryFolder", folderId);
    },
    [onLibraryDragStart, libraryDragSourceRef],
  );

  const handleLibraryDragOverRow = useCallback(
    (
      targetKind: DragTargetKind,
      targetId: string,
      dropPosition: DropPosition,
    ) => {
      onLibraryDragOver(targetKind, targetId, dropPosition);
    },
    [onLibraryDragOver],
  );

  const handleLibraryDropRow = useCallback(
    (targetKind: DragTargetKind, targetId: string) => {
      const source = libraryDragSourceRef.current;
      libraryDragSourceRef.current = null;
      clearLibraryDragSession();
      if (!source || source.id === targetId) return;

      const sourcePackage = modularSprites.find(
        (sprite) =>
          sprite.sourceAssetId === source.id ||
          sprite.parts.some((part) => part.assetId === source.id),
      );
      const targetPackage = modularSprites.find((sprite) => {
        if (targetKind === "asset") {
          return (
            sprite.sourceAssetId === targetId ||
            sprite.parts.some((part) => part.assetId === targetId)
          );
        }
        if (targetKind !== "folder") return false;
        const sourcePlacement = assetPlacements.find(
          (placement) => placement.assetId === sprite.sourceAssetId,
        );
        return sourcePlacement?.folderId === targetId;
      });
      const sourceIsPackageSource =
        source.kind === "asset" && sourcePackage?.sourceAssetId === source.id;
      const sourceIsPackagePart = Boolean(
        source.kind === "asset" &&
          sourcePackage?.parts.some((part) => part.assetId === source.id),
      );
      if (sourceIsPackageSource) return;
      if (sourceIsPackagePart) {
        if (!targetPackage || targetPackage.id === sourcePackage?.id) return;
        onRegenerateModularSprite?.(targetPackage.id, {
          includeAssetId: source.id,
          force: true,
        });
        return;
      }
      if (source.kind === "folder") {
        const lockedPackage = modularSprites.find((sprite) => {
          const sourcePlacement = assetPlacements.find(
            (placement) => placement.assetId === sprite.sourceAssetId,
          );
          return sourcePlacement?.folderId === source.id;
        });
        if (lockedPackage) return;
      }
      if (targetPackage && source.kind === "asset") {
        onRegenerateModularSprite?.(
          targetPackage.id,
          { includeAssetId: source.id, force: true },
        );
        return;
      }

      if (source.kind === "asset" && targetKind === "folder") {
        updateProject((projectDraft) => {
          if (!projectDraft.assetPlacements) projectDraft.assetPlacements = [];
          const existing = projectDraft.assetPlacements.find(
            (p) => p.assetId === source.id,
          );
          if (existing) {
            existing.folderId = targetId;
          } else {
            projectDraft.assetPlacements.push({
              assetId: source.id,
              folderId: targetId,
            });
          }
        });
      } else if (source.kind === "asset" && targetKind === "root") {
        updateProject((projectDraft) => {
          if (!projectDraft.assetPlacements) projectDraft.assetPlacements = [];
          const existing = projectDraft.assetPlacements.find(
            (p) => p.assetId === source.id,
          );
          if (existing) {
            existing.folderId = null;
          } else {
            projectDraft.assetPlacements.push({
              assetId: source.id,
              folderId: null,
            });
          }
        });
      } else if (source.kind === "folder" && targetKind === "folder") {
        updateProject((projectDraft) => {
          const folder = (projectDraft.libraryFolders ?? []).find(
            (f) => f.id === source.id,
          );
          if (folder) folder.parentId = targetId;
        });
      } else if (source.kind === "folder" && targetKind === "root") {
        updateProject((projectDraft) => {
          const folder = (projectDraft.libraryFolders ?? []).find(
            (f) => f.id === source.id,
          );
          if (folder) folder.parentId = null;
        });
      }
    },
    [
      assetPlacements,
      clearLibraryDragSession,
      modularSprites,
      onRegenerateModularSprite,
      updateProject,
    ],
  );

  return {
    shared: {
      nodes,
      selection,
      hoverHit: visibleHoverHit,
      textureMap,
      editorMode,
    },
    tabs: {
      active: activeLayerTab,
      setActive: setActiveLayerTab,
    },
    library: {
      tree: libraryTree,
      flat: libraryFlat,
      expandedFolderIds,
      dragSession: libraryDragSession,
      dragActive: libraryDragActive,
      onToggleFolderExpand: toggleFolderExpand,
      onCreateFolder,
      onRenameFolder,
      onRenameAsset: onRenameLibraryAsset,
      onRemoveFolder: onRemoveLibraryFolder,
      onRemoveFromPackage,
      onRemoveAsset: onRemoveLibraryAsset,
      onDragStartAsset: handleLibraryDragStartAsset,
      onDragStartFolder: handleLibraryDragStartFolder,
      onDragOverRow: handleLibraryDragOverRow,
      onDropRow: handleLibraryDropRow,
      onDragEnter: handleLibraryDragEnter,
      onDragOverBackground: handleLibraryDragOver,
      onDragLeave: handleLibraryDragLeave,
      onDropBackground: handleLibraryDrop,
      onSelect: handleSelect,
      onImportClick,
      onImportModularSprite,
      onRegenerateModularSprite,
      imageCount: depthNodes.length,
      boneCount: bones.length,
    },
    depth: {
      nodes: depthNodes,
      dragSession: depthSession,
      editorMode,
      onSelect: handleSelect,
      onHover: handleListHover,
      onClearHover: handleListHoverClear,
      onToggleVisible: toggleVisible,
      onDragStart: onDragStartDepth,
      onDragOver: onDragOverDepth,
      onDrop: onDropDepth,
      onDuplicate: duplicateNode,
      onDelete: handleDeleteNode,
      onRename: onRenameNode,
    },
    bones: {
      rows: boneTreeRows,
      dragSession: boneSession,
      activeBoneId,
      expanded: expandedGroups,
      allExpanded: allBonesExpanded,
      showImages: showBoneImages,
      editorMode,
      onSelectBone: handleBoneSelect,
      onSelectNode: handleSelect,
      onSelectConstraint: handleConstraintSelect,
      onHover: handleListHover,
      onClearHover: handleListHoverClear,
      onToggleExpand: toggleExpand,
      onToggleAll: toggleAllBoneRows,
      onToggleImages: toggleBoneImages,
      onToggleVisible: toggleVisible,
      onToggleLink: toggleNodeLink,
      onUnassignNode: unassignNode,
      onDetachBone: detachBone,
      onDragStart: onBoneGroupDragStart,
      onDragEnd: onBoneGroupDragEnd,
      onDragOver: onDragOverBone,
      onDrop: onBoneGroupDrop,
      onCreateBone: createBoneFromCurrentSelection,
      onRenameBone,
      onRenameNode,
      onDeleteBone,
      onDeleteNode: handleDeleteNode,
    },
  };
}

export const useLayerPanelController = (
  ...args: Parameters<typeof useLayerPanelControllerImpl>
): ReturnType<typeof useLayerPanelControllerImpl> =>
  useLayerPanelControllerImpl(...args);
