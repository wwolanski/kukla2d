// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '../renderHook.jsx';

const { mockSaveProject, mockWriteRecovery, mockReadRecovery, mockClearRecovery } = vi.hoisted(() => ({
  mockSaveProject: vi.fn(async () => new Blob(['archive-data'], { type: 'application/zip' })),
  mockWriteRecovery: vi.fn(async () => {}),
  mockReadRecovery: vi.fn(async () => null),
  mockClearRecovery: vi.fn(async () => {}),
}));

vi.mock('../../src/io/projectFile', () => ({
  saveProject: (...args) => mockSaveProject(...args),
}));

vi.mock('../../src/io/projectDb', () => ({
  readRecovery: (...args) => mockReadRecovery(...args),
  writeRecovery: (...args) => mockWriteRecovery(...args),
  clearRecovery: (...args) => mockClearRecovery(...args),
  isValidRecoveryRecord: () => true,
}));

let storeState = {
  hasUnsavedChanges: false,
  project: { version: 1, textures: [], nodes: [], animations: [] },
};
const storeSubscribers = new Set();

function setStoreState(nextState) {
  storeState = nextState;
  for (const subscriber of storeSubscribers) subscriber(storeState);
}

vi.mock('../../src/store/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector) => selector(storeState),
    {
      getState: () => storeState,
      subscribe: (subscriber) => {
        storeSubscribers.add(subscriber);
        return () => storeSubscribers.delete(subscriber);
      },
    },
  ),
}));

const { useRecoveryScheduler } = await import('../../src/features/projects/application/useRecoveryScheduler');

describe('useRecoveryScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSaveProject.mockReset();
    mockWriteRecovery.mockReset();
    mockReadRecovery.mockReset();
    mockClearRecovery.mockReset();
    mockSaveProject.mockResolvedValue(new Blob(['archive-data'], { type: 'application/zip' }));
    mockWriteRecovery.mockResolvedValue(undefined);
    mockClearRecovery.mockResolvedValue(undefined);
    mockReadRecovery.mockResolvedValue(null);
    storeState = {
      hasUnsavedChanges: false,
      project: { version: 1, textures: [], nodes: [], animations: [] },
    };
    storeSubscribers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle status', () => {
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));
    expect(result.current.status).toBe('idle');
  });

  it('scheduleSave triggers debounced save', async () => {
    storeState.hasUnsavedChanges = true;
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));

    await act(async () => {
      result.current.scheduleSave();
    });

    expect(result.current.status).toBe('scheduled');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockSaveProject).toHaveBeenCalledOnce();
  });

  it('clearRecovery resets state and calls DB clear', async () => {
    storeState.hasUnsavedChanges = true;
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));

    await act(async () => {
      result.current.scheduleSave();
    });

    await act(async () => {
      result.current.forceSave();
    });

    await act(async () => {
      await result.current.clearRecovery();
    });

    expect(result.current.status).toBe('idle');
    expect(mockClearRecovery).toHaveBeenCalled();
  });

  it('does not save when disabled', async () => {
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: false }));

    await act(async () => {
      result.current.scheduleSave();
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockSaveProject).not.toHaveBeenCalled();
  });

  it('forceSave skips debounce', async () => {
    storeState.hasUnsavedChanges = true;
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));

    await act(async () => {
      result.current.forceSave();
    });

    expect(mockSaveProject).toHaveBeenCalledOnce();
  });

  it('monotonically increasing revision', async () => {
    storeState.hasUnsavedChanges = true;
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));

    await act(async () => {
      result.current.scheduleSave();
    });

    await act(async () => {
      result.current.scheduleSave();
    });

    await act(async () => {
      result.current.forceSave();
    });

    const lastWrite = mockWriteRecovery.mock.calls[mockWriteRecovery.mock.calls.length - 1];
    expect(lastWrite).toBeTruthy();
    expect(lastWrite[0].revision).toBeGreaterThanOrEqual(2);
  });

  it('writes recovery record to DB with valid structure', async () => {
    storeState.hasUnsavedChanges = true;
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));

    await act(async () => {
      result.current.forceSave();
    });

    expect(mockWriteRecovery).toHaveBeenCalledOnce();
    const record = mockWriteRecovery.mock.calls[0][0];
    expect(record.id).toBe('workspace-recovery');
    expect(record.archive).toBeInstanceOf(Blob);
    expect(typeof record.savedAt).toBe('number');
    expect(typeof record.revision).toBe('number');
  });

  it('debounces every dirty project revision and saves the newest snapshot', async () => {
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));
    const firstProject = { ...storeState.project, nodes: [{ id: 'first' }] };
    const newestProject = { ...storeState.project, nodes: [{ id: 'newest' }] };

    act(() => {
      setStoreState({ ...storeState, hasUnsavedChanges: true, project: firstProject });
      setStoreState({ ...storeState, project: newestProject });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockSaveProject).toHaveBeenCalledOnce();
    expect(mockSaveProject).toHaveBeenCalledWith(newestProject);
    expect(result.current.status).toBe('saved');
  });

  it('does not recreate stale recovery when clear races with serialization', async () => {
    let resolveArchive;
    mockSaveProject.mockImplementationOnce(() => new Promise((resolve) => {
      resolveArchive = resolve;
    }));
    storeState = { ...storeState, hasUnsavedChanges: true };
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));

    let savePromise;
    act(() => {
      savePromise = result.current.forceSave();
    });
    await vi.waitFor(() => expect(resolveArchive).toBeTypeOf('function'));
    await act(async () => {
      await result.current.clearRecovery();
      resolveArchive(new Blob(['stale']));
      await savePromise;
    });

    expect(mockClearRecovery).toHaveBeenCalledOnce();
    expect(mockWriteRecovery).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('reports failed when recovery clear cannot commit', async () => {
    mockClearRecovery.mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(() => useRecoveryScheduler({ enabled: true }));

    let cleared;
    await act(async () => {
      cleared = await result.current.clearRecovery();
    });

    expect(cleared).toBe(false);
    expect(result.current.status).toBe('failed');
  });
});
