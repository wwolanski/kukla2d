// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '../renderHook.jsx';
import { useCanvasImport } from '@/features/canvas/application/useCanvasImport.js';
import { useImportSettingsStore } from '@/store/importSettingsStore';

const psdMock = vi.hoisted(() => ({ importPsd: vi.fn() }));
vi.mock('@/io/psd', () => psdMock);

function imageData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}

describe('PSD import', () => {
  let originalCreateElement;

  beforeEach(() => {
    useImportSettingsStore.setState({ autoAddToCanvas: true });
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (String(tagName).toLowerCase() !== 'canvas') {
        return originalCreateElement(tagName, options);
      }
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
          getImageData: vi.fn((x, y, width, height) => imageData(width, height)),
          putImageData: vi.fn(),
        })),
        toBlob: vi.fn(),
      };
    });
  });

  afterEach(() => {
    useImportSettingsStore.setState({ autoAddToCanvas: true });
    document.createElement.mockRestore();
  });

  it('imports SeeThrough-style layers directly without a legacy wizard', async () => {
    const layers = [
      { name: 'eyewhite-l', x: 0, y: 0, width: 2, height: 2, imageData: imageData(2, 2), opacity: 1, visible: true },
      { name: 'irides-l', x: 0, y: 0, width: 2, height: 2, imageData: imageData(2, 2), opacity: 1, visible: true },
      { name: 'face', x: 0, y: 0, width: 2, height: 2, imageData: imageData(2, 2), opacity: 1, visible: true },
      { name: 'front hair', x: 0, y: 0, width: 2, height: 2, imageData: imageData(2, 2), opacity: 1, visible: true },
    ];
    psdMock.importPsd.mockResolvedValue({ width: 4, height: 4, layers });

    const project = {
      canvas: {},
      textures: [],
      nodes: [],
      libraryFolders: [],
      assetPlacements: [],
    };
    const version = { textureVersion: 0 };
    const updateProject = vi.fn((recipe) => recipe(project, version));
    const { result } = renderHook(() => useCanvasImport({
      projectRef: { current: project },
      canvasRef: { current: null },
      editorRef: { current: null },
      updateProject,
      resetProject: vi.fn(),
      centerView: vi.fn(),
      sceneGatewayRef: { current: null },
      textureCache: { __internal: { imageDataByPartId: new Map() } },
      markDirty: vi.fn(),
      setConfirmWipeOpen: vi.fn(),
      pendingFile: null,
      setPendingFile: vi.fn(),
      animRef: { current: null },
      sendWorkflowEvent: vi.fn(),
      resourceOwnerRef: { current: null },
    }));

    await act(async () => {
      await result.current.processPsdFile({
        name: 'seethrough_output.psd',
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
    });

    expect(project.nodes).toHaveLength(layers.length);
    expect(project.nodes.map(node => node.name)).toEqual(layers.map(layer => layer.name));
    expect(project.nodes.find(node => node.name === 'irides-l')?.clipToPartId)
      .toBe(project.nodes.find(node => node.name === 'eyewhite-l')?.id);
    expect(project.libraryFolders).toEqual([
      expect.objectContaining({ name: 'seethrough_output', sourceFileName: 'seethrough_output.psd' }),
    ]);
  });

  it('imports PSD layers to Library without changing canvas when auto-add is disabled', async () => {
    useImportSettingsStore.setState({ autoAddToCanvas: false });
    const layers = [
      { name: 'replacement-face', x: 0, y: 0, width: 2, height: 2, imageData: imageData(2, 2), opacity: 1, visible: true },
      { name: 'replacement-body', x: 0, y: 0, width: 2, height: 2, imageData: imageData(2, 2), opacity: 1, visible: true },
    ];
    psdMock.importPsd.mockResolvedValue({ width: 2048, height: 2048, layers });

    const existingNode = { id: 'existing', type: 'part', name: 'Existing' };
    const project = {
      canvas: { width: 800, height: 600, presetId: 'custom', fitSource: null },
      textures: [],
      nodes: [existingNode],
      libraryFolders: [],
      assetPlacements: [],
    };
    const version = { textureVersion: 0 };
    const centerView = vi.fn();
    const resetProject = vi.fn();
    const setConfirmWipeOpen = vi.fn();
    const updateProject = vi.fn(recipe => recipe(project, version));
    const { result } = renderHook(() => useCanvasImport({
      projectRef: { current: project },
      canvasRef: { current: null },
      editorRef: { current: null },
      updateProject,
      resetProject,
      centerView,
      sceneGatewayRef: { current: null },
      textureCache: { __internal: { imageDataByPartId: new Map() } },
      markDirty: vi.fn(),
      setConfirmWipeOpen,
      pendingFile: null,
      setPendingFile: vi.fn(),
      animRef: { current: null },
      sendWorkflowEvent: vi.fn(),
      resourceOwnerRef: { current: null },
    }));

    await act(async () => {
      await result.current.importPsdFile({
        name: 'replacements.psd',
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
    });

    expect(setConfirmWipeOpen).not.toHaveBeenCalled();
    expect(resetProject).not.toHaveBeenCalled();
    expect(centerView).not.toHaveBeenCalled();
    expect(project.canvas).toEqual({ width: 800, height: 600, presetId: 'custom', fitSource: null });
    expect(project.nodes).toEqual([existingNode]);
    expect(project.textures).toHaveLength(layers.length);
    expect(project.assetPlacements).toHaveLength(layers.length);
    expect(project.libraryFolders).toEqual([
      expect.objectContaining({ name: 'replacements', sourceFileName: 'replacements.psd' }),
    ]);
  });

  it('offers PSD import to Library from replacement flow without wiping project', async () => {
    const layers = [
      { name: 'replacement-face', x: 0, y: 0, width: 2, height: 2, imageData: imageData(2, 2), opacity: 1, visible: true },
    ];
    psdMock.importPsd.mockResolvedValue({ width: 2048, height: 2048, layers });

    const existingNode = { id: 'existing', type: 'part', name: 'Existing' };
    const project = {
      canvas: { width: 800, height: 600, presetId: 'custom', fitSource: null },
      textures: [],
      nodes: [existingNode],
      libraryFolders: [],
      assetPlacements: [],
    };
    const version = { textureVersion: 0 };
    const resetProject = vi.fn();
    const setConfirmWipeOpen = vi.fn();
    const setPendingFile = vi.fn();
    const updateProject = vi.fn(recipe => recipe(project, version));
    const file = { name: 'replacements.psd', arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) };
    const { result } = renderHook(() => useCanvasImport({
      projectRef: { current: project },
      canvasRef: { current: null },
      editorRef: { current: null },
      updateProject,
      resetProject,
      centerView: vi.fn(),
      sceneGatewayRef: { current: null },
      textureCache: { __internal: { imageDataByPartId: new Map() } },
      markDirty: vi.fn(),
      setConfirmWipeOpen,
      pendingFile: file,
      setPendingFile,
      animRef: { current: null },
      sendWorkflowEvent: vi.fn(),
      resourceOwnerRef: { current: null },
    }));

    await act(async () => {
      await result.current.handleImportPsdToLibrary();
    });

    expect(resetProject).not.toHaveBeenCalled();
    expect(project.canvas).toEqual({ width: 800, height: 600, presetId: 'custom', fitSource: null });
    expect(project.nodes).toEqual([existingNode]);
    expect(project.textures).toHaveLength(1);
    expect(project.assetPlacements).toHaveLength(1);
    expect(setPendingFile).toHaveBeenCalledWith(null);
    expect(setConfirmWipeOpen).toHaveBeenCalledWith(false);
  });

  it('imports PNG to Library without creating a canvas node when auto-add is disabled', async () => {
    useImportSettingsStore.setState({ autoAddToCanvas: false });
    const OriginalImage = globalThis.Image;
    const originalCreateObjectURL = globalThis.URL.createObjectURL;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:replacement');
    globalThis.Image = class {
      width = 320;
      height = 240;
      set src(_value) { queueMicrotask(() => this.onload?.()); }
    };

    try {
      const existingNode = { id: 'existing', type: 'part', name: 'Existing' };
      const project = {
        canvas: { width: 800, height: 600, presetId: 'custom', fitSource: null },
        textures: [],
        nodes: [existingNode],
        libraryFolders: [],
        assetPlacements: [],
      };
      const version = { textureVersion: 0 };
      const centerView = vi.fn();
      const uploadTexture = vi.fn();
      const updateProject = vi.fn(recipe => recipe(project, version));
      const { result } = renderHook(() => useCanvasImport({
        projectRef: { current: project },
        canvasRef: { current: null },
        editorRef: { current: null },
        updateProject,
        resetProject: vi.fn(),
        centerView,
        sceneGatewayRef: { current: { uploadTexture, uploadQuadFallback: vi.fn() } },
        textureCache: { __internal: { imageDataByPartId: new Map() } },
        markDirty: vi.fn(),
        setConfirmWipeOpen: vi.fn(),
        pendingFile: null,
        setPendingFile: vi.fn(),
        animRef: { current: null },
        sendWorkflowEvent: vi.fn(),
        resourceOwnerRef: { current: { track: vi.fn() } },
      }));

      await act(async () => {
        await result.current.importPng({ name: 'replacement.png', type: 'image/png', size: 1234 });
        await result.current.importPng({ name: 'replacement.png', type: 'image/png', size: 1234 });
      });

      expect(project.canvas).toEqual({ width: 800, height: 600, presetId: 'custom', fitSource: null });
      expect(project.nodes).toEqual([existingNode]);
      expect(project.textures).toEqual([
        expect.objectContaining({ name: 'replacement', source: 'blob:replacement', fileName: 'replacement.png', fileSize: 1234 }),
        expect.objectContaining({ name: 'replacement (1)', source: 'blob:replacement', fileName: 'replacement.png', fileSize: 1234 }),
      ]);
      expect(project.assetPlacements).toHaveLength(2);
      expect(centerView).not.toHaveBeenCalled();
      expect(uploadTexture).not.toHaveBeenCalled();
    } finally {
      globalThis.Image = OriginalImage;
      globalThis.URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
