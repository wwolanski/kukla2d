// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useProjectSession } from '../../src/features/projects/application/useProjectSession';
import { act, renderHook } from '../renderHook.jsx';

const storeMocks = vi.hoisted(() => ({
  startEditor: vi.fn(),
  nodes: [],
  saveToDb: vi.fn(),
  hasUnsavedChanges: false,
}));

vi.mock('../../src/store/editorStore', () => ({
  useEditorStore: selector => selector({ startEditor: storeMocks.startEditor }),
}));

vi.mock('../../src/store/projectStore', () => ({
  useProjectStore: selector => selector({
    project: { nodes: storeMocks.nodes },
    hasUnsavedChanges: storeMocks.hasUnsavedChanges,
  }),
}));

vi.mock('../../src/io/projectDb', () => ({
  saveToDb: storeMocks.saveToDb,
}));

describe('useProjectSession - recovery lifecycle', () => {
  let clearRecoveryMock;

  beforeEach(() => {
    storeMocks.startEditor.mockReset();
    storeMocks.saveToDb.mockReset();
    storeMocks.nodes = [];
    storeMocks.hasUnsavedChanges = false;
    clearRecoveryMock = vi.fn();
  });

  it('calls clearRecovery on handleSavedToDb', async () => {
    const { result } = renderHook(() => useProjectSession({
      loadRef: { current: vi.fn() },
      resetRef: { current: vi.fn() },
      thumbCaptureRef: { current: vi.fn() },
      clearRecovery: clearRecoveryMock,
    }));

    await act(async () => {
      result.current.handleSavedToDb('id-1', 'Test Project');
    });

    expect(clearRecoveryMock).toHaveBeenCalledOnce();
  });

  it('calls clearRecovery on handleSaveSuccess', async () => {
    const { result } = renderHook(() => useProjectSession({
      loadRef: { current: vi.fn() },
      resetRef: { current: vi.fn() },
      thumbCaptureRef: { current: vi.fn() },
      clearRecovery: clearRecoveryMock,
    }));

    await act(async () => {
      result.current.handleSaveSuccess();
    });

    expect(clearRecoveryMock).toHaveBeenCalledOnce();
  });

  it('calls clearRecovery on successful handleLoadRecord', async () => {
    const loadFn = vi.fn(async () => ({ success: true }));
    const { result } = renderHook(() => useProjectSession({
      loadRef: { current: loadFn },
      resetRef: { current: vi.fn() },
      thumbCaptureRef: { current: vi.fn() },
      clearRecovery: clearRecoveryMock,
    }));

    await act(async () => {
      await result.current.handleLoadRecord({ id: 'abc', name: 'Test', blob: new Blob() });
    });

    expect(clearRecoveryMock).toHaveBeenCalledOnce();
  });

  it('calls clearRecovery on successful finalizeLoadFile', async () => {
    const loadFn = vi.fn(async () => ({ success: true }));
    const { result } = renderHook(() => useProjectSession({
      loadRef: { current: loadFn },
      resetRef: { current: vi.fn() },
      thumbCaptureRef: { current: vi.fn(() => '') },
      clearRecovery: clearRecoveryMock,
    }));

    await act(async () => {
      await result.current.finalizeLoadFile(new File(['x'], 'test.kk2d', { type: 'application/zip' }), false);
    });

    expect(clearRecoveryMock).toHaveBeenCalledOnce();
  });

  it('calls clearRecovery on startNewProject', async () => {
    const { result } = renderHook(() => useProjectSession({
      loadRef: { current: vi.fn() },
      resetRef: { current: vi.fn() },
      thumbCaptureRef: { current: vi.fn() },
      clearRecovery: clearRecoveryMock,
    }));

    await act(async () => {
      result.current.handleNewProject();
    });

    expect(clearRecoveryMock).toHaveBeenCalledOnce();
  });

  it('does not crash when clearRecovery is not provided', async () => {
    const { result } = renderHook(() => useProjectSession({
      loadRef: { current: vi.fn() },
      resetRef: { current: vi.fn() },
      thumbCaptureRef: { current: vi.fn() },
    }));

    await act(async () => {
      result.current.handleSavedToDb('id-1', 'Test');
    });

    expect(result.current.currentDbProjectId).toBe('id-1');
  });

  it('confirms replacement for a dirty project with no nodes', () => {
    storeMocks.hasUnsavedChanges = true;
    const { result } = renderHook(() => useProjectSession({
      loadRef: { current: vi.fn() },
      resetRef: { current: vi.fn() },
      thumbCaptureRef: { current: vi.fn() },
      clearRecovery: clearRecoveryMock,
    }));

    act(() => {
      result.current.handleNewProject();
    });

    expect(result.current.confirmWipe.open).toBe(true);
    expect(result.current.confirmWipe.type).toBe('new');
    expect(clearRecoveryMock).not.toHaveBeenCalled();
  });
});
