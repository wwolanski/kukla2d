// @vitest-environment jsdom

import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '@/core/createEmptyProject';
import { EditorWorkflowContext } from '@/features/canvas/application/EditorWorkflowContext.js';
import { useLayerPanelBoneTreeDnD } from '@/features/layers/application/useLayerPanelBoneTreeDnD';
import { useLayerPanelDepthDnD } from '@/features/layers/application/useLayerPanelDepthDnD';
import { useLayerPanelSelection } from '@/features/layers/application/useLayerPanelSelection';
import { useLayerPanelController } from '@/features/layers/application/useLayerPanelController';
import { useProjectStore } from '@/store/projectStore';
import { act, renderHook } from '../renderHook.jsx';

function applyProjectRecipe(project, recipe) {
  recipe(project);
}

function renderLayerPanelController(options = {}) {
  let current;
  const container = document.createElement('div');
  const root = createRoot(container);

  function Harness() {
    current = useLayerPanelController(options);
    return null;
  }

  act(() => {
    root.render(
      <EditorWorkflowContext.Provider>
        <Harness />
      </EditorWorkflowContext.Provider>,
    );
  });

  return {
    result: {
      get current() {
        return current;
      },
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

function createModularPackageProject() {
  const project = createEmptyProject();
  project.libraryFolders = [
    { id: 'source-folder', name: 'Source Package', parentId: null },
    { id: 'target-folder', name: 'Target Package', parentId: null },
    { id: 'loose-folder', name: 'Loose Folder', parentId: null },
  ];
  project.textures = [
    { id: 'source-asset', source: 'blob:source', name: 'Source Package Source' },
    { id: 'source-part', source: 'blob:part', name: 'Head' },
    { id: 'target-asset', source: 'blob:target', name: 'Target Package Source' },
    { id: 'loose-asset', source: 'blob:loose', name: 'Cape' },
  ];
  project.assetPlacements = [
    { assetId: 'source-asset', folderId: 'source-folder' },
    { assetId: 'source-part', folderId: 'source-folder' },
    { assetId: 'target-asset', folderId: 'target-folder' },
    { assetId: 'loose-asset', folderId: null },
  ];
  project.modularSprites = [
    {
      id: 'source-package',
      schemaVersion: 1,
      name: 'Source Package',
      sourceAssetId: 'source-asset',
      source: { width: 1, height: 1 },
      processorVersion: 1,
      recipe: {},
      parts: [
        {
          partKey: 'head',
          assetId: 'source-part',
          name: 'Head',
          role: 'custom',
          side: 'none',
          required: false,
          order: 0,
          extractionFrame: { x: 0, y: 0, width: 1, height: 1 },
          contentBounds: { x: 0, y: 0, width: 1, height: 1 },
          componentSeeds: [],
        },
      ],
    },
    {
      id: 'target-package',
      schemaVersion: 1,
      name: 'Target Package',
      sourceAssetId: 'target-asset',
      source: { width: 1, height: 1 },
      processorVersion: 1,
      recipe: {},
      parts: [],
    },
  ];
  return project;
}

function startLibraryAssetDrag(controller, assetId) {
  const dataTransfer = {
    effectAllowed: '',
    setData: vi.fn(),
    setDragImage: vi.fn(),
  };
  controller.onDragStartAsset({ dataTransfer }, assetId);
}

describe('LayerPanel application hooks', () => {
  it('reorders depth rows through the supplied project mutation boundary', () => {
    const project = {
      nodes: [
        { id: 'front', type: 'part', draw_order: 2 },
        { id: 'middle', type: 'part', draw_order: 1 },
        { id: 'back', type: 'part', draw_order: 0 },
      ],
    };
    const updateProject = vi.fn(recipe => applyProjectRecipe(project, recipe));
    const { result } = renderHook(() => useLayerPanelDepthDnD({
      nodes: project.nodes,
      selection: [],
      updateProject,
      deleteNode: vi.fn(),
      setSelection: vi.fn(),
    }));

    act(() => {
      result.current.onDragStart({ dataTransfer: { setDragImage: vi.fn() } }, 'front');
      result.current.onDrop('back');
    });

    expect(updateProject).toHaveBeenCalledOnce();
    expect(project.nodes.map(node => [node.id, node.draw_order])).toEqual([
      ['front', 1],
      ['middle', 2],
      ['back', 0],
    ]);
  });

  it('routes node selection through editor and workflow boundaries', () => {
    const setSelection = vi.fn();
    const setShowSkeleton = vi.fn();
    const send = vi.fn();
    const { result } = renderHook(() => useLayerPanelSelection({
      bones: [],
      nodes: [{ id: 'part-1', type: 'part' }],
      boneTreeRows: [],
      selection: [],
      updateProject: vi.fn(),
      setSelection,
      setActiveBoneId: vi.fn(),
      setActiveConstraintId: vi.fn(),
      setRiggingMode: vi.fn(),
      setRiggingTool: vi.fn(),
      showSkeleton: true,
      setShowSkeleton,
      send,
      expandGroup: vi.fn(),
    }));

    act(() => {
      result.current.handleSelect('part-1');
    });

    expect(setSelection).toHaveBeenCalledWith(['part-1']);
    expect(send).toHaveBeenCalledWith({ type: 'SET_TOOL', tool: 'transform' });
    expect(setShowSkeleton).toHaveBeenCalledWith(false);
  });

  it('keeps the bone tree expansion boundary explicit', () => {
    const toggleGroupExpand = vi.fn();
    const { result } = renderHook(() => useLayerPanelBoneTreeDnD({
      updateProject: vi.fn(),
      toggleGroupExpand,
      expandGroup: vi.fn(),
      handleBoneSelect: vi.fn(),
    }));

    act(() => {
      result.current.toggleExpand('bone:root');
    });

    expect(toggleGroupExpand).toHaveBeenCalledWith('bone:root');
  });

  it('rejects duplicate folder/package renames and allows the current name with different casing', () => {
    const originalState = useProjectStore.getState();
    const project = createEmptyProject();
    project.libraryFolders = [
      { id: 'folder-hero', name: 'Hero', parentId: null },
      { id: 'folder-body', name: 'Body', parentId: null },
    ];
    project.textures.push({
      id: 'source-hero',
      source: 'blob:hero',
      name: 'Hero Source',
    });
    project.assetPlacements.push({ assetId: 'source-hero', folderId: 'folder-hero' });
    project.modularSprites.push({
      id: 'sprite-hero',
      schemaVersion: 1,
      name: 'Hero',
      sourceAssetId: 'source-hero',
      source: { width: 1, height: 1 },
      processorVersion: 1,
      recipe: {},
      parts: [],
    });
    useProjectStore.setState({
      project,
      versionControl: { geometryVersion: 0, transformVersion: 0, textureVersion: 0 },
      hasUnsavedChanges: false,
    });

    const rendered = renderLayerPanelController();
    try {
      act(() => {
        rendered.result.current.library.onRenameFolder('folder-hero', 'bOdY');
      });
      expect(useProjectStore.getState().project.libraryFolders[0].name).toBe('Hero');
      expect(useProjectStore.getState().hasUnsavedChanges).toBe(false);

      act(() => {
        rendered.result.current.library.onRenameFolder('folder-hero', 'hERO');
      });
      expect(useProjectStore.getState().project.libraryFolders[0].name).toBe('hERO');
      expect(useProjectStore.getState().project.modularSprites[0].name).toBe('hERO');
      expect(useProjectStore.getState().project.textures[0].name).toBe('hERO Source');

      act(() => {
        rendered.result.current.library.onRenameAsset('source-hero', 'BODY');
      });
      expect(useProjectStore.getState().project.libraryFolders[0].name).toBe('hERO');
      expect(useProjectStore.getState().project.modularSprites[0].name).toBe('hERO');

      act(() => {
        rendered.result.current.library.onRenameAsset('source-hero', 'HERO');
      });
      expect(useProjectStore.getState().project.libraryFolders[0].name).toBe('HERO');
      expect(useProjectStore.getState().project.modularSprites[0].name).toBe('HERO');
    } finally {
      rendered.unmount();
      useProjectStore.setState(originalState);
    }
  });

  it('regenerates the target package when dragging a part across packages', () => {
    const originalState = useProjectStore.getState();
    useProjectStore.setState({
      project: createModularPackageProject(),
      versionControl: { geometryVersion: 0, transformVersion: 0, textureVersion: 0 },
      hasUnsavedChanges: false,
    });
    const onRegenerateModularSprite = vi.fn();
    const rendered = renderLayerPanelController({ onRegenerateModularSprite });

    try {
      act(() => {
        startLibraryAssetDrag(rendered.result.current.library, 'source-part');
        rendered.result.current.library.onDropRow('folder', 'target-folder');
      });

      expect(onRegenerateModularSprite).toHaveBeenCalledOnce();
      expect(onRegenerateModularSprite).toHaveBeenCalledWith('target-package', {
        includeAssetId: 'source-part',
        force: true,
      });
    } finally {
      rendered.unmount();
      useProjectStore.setState(originalState);
    }
  });

  it('treats every target package asset as the package drop surface', () => {
    const originalState = useProjectStore.getState();
    useProjectStore.setState({
      project: createModularPackageProject(),
      versionControl: { geometryVersion: 0, transformVersion: 0, textureVersion: 0 },
      hasUnsavedChanges: false,
    });
    const onRegenerateModularSprite = vi.fn();
    const rendered = renderLayerPanelController({ onRegenerateModularSprite });

    try {
      act(() => {
        startLibraryAssetDrag(rendered.result.current.library, 'loose-asset');
        rendered.result.current.library.onDropRow('asset', 'target-asset');
      });

      expect(onRegenerateModularSprite).toHaveBeenCalledWith('target-package', {
        includeAssetId: 'loose-asset',
        force: true,
      });
    } finally {
      rendered.unmount();
      useProjectStore.setState(originalState);
    }
  });

  it('ignores package-part drops inside its package and outside any package', () => {
    const originalState = useProjectStore.getState();
    useProjectStore.setState({
      project: createModularPackageProject(),
      versionControl: { geometryVersion: 0, transformVersion: 0, textureVersion: 0 },
      hasUnsavedChanges: false,
    });
    const onRegenerateModularSprite = vi.fn();
    const rendered = renderLayerPanelController({ onRegenerateModularSprite });

    try {
      act(() => {
        startLibraryAssetDrag(rendered.result.current.library, 'source-part');
        rendered.result.current.library.onDropRow('folder', 'source-folder');
        startLibraryAssetDrag(rendered.result.current.library, 'source-part');
        rendered.result.current.library.onDropRow('root', 'root');
        startLibraryAssetDrag(rendered.result.current.library, 'source-part');
        rendered.result.current.library.onDropRow('folder', 'loose-folder');
      });

      expect(onRegenerateModularSprite).not.toHaveBeenCalled();
      expect(useProjectStore.getState().project.assetPlacements).toEqual(
        expect.arrayContaining([
          { assetId: 'source-part', folderId: 'source-folder' },
        ]),
      );
    } finally {
      rendered.unmount();
      useProjectStore.setState(originalState);
    }
  });

  it('separates removing a package part from the package and from the library', () => {
    const originalState = useProjectStore.getState();
    useProjectStore.setState({
      project: createModularPackageProject(),
      versionControl: { geometryVersion: 0, transformVersion: 0, textureVersion: 0 },
      hasUnsavedChanges: false,
    });
    const onRegenerateModularSprite = vi.fn();
    const rendered = renderLayerPanelController({ onRegenerateModularSprite });

    try {
      act(() => {
        rendered.result.current.library.onRemoveFromPackage('source-part');
        rendered.result.current.library.onRemoveAsset('source-part');
      });

      expect(onRegenerateModularSprite).toHaveBeenNthCalledWith(
        1,
        'source-package',
        {
          removeAssetId: 'source-part',
          force: true,
          removeFromLibrary: false,
        },
      );
      expect(onRegenerateModularSprite).toHaveBeenNthCalledWith(
        2,
        'source-package',
        {
          removeAssetId: 'source-part',
          force: true,
          removeFromLibrary: true,
        },
      );
    } finally {
      rendered.unmount();
      useProjectStore.setState(originalState);
    }
  });
});
