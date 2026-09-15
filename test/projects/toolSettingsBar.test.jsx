// @vitest-environment jsdom
/* eslint-disable react/prop-types */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, useEffect } from 'react';
import { EditorWorkflowContext, useWorkflowActor } from '@/features/canvas';
import { ToolSettingsBar } from '@/features/projects';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import { createEmptyProject } from '@/core/createEmptyProject';

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function ActorRefCapture({ onActor }) {
  const { actorRef } = useWorkflowActor();
  useEffect(() => {
    onActor.current = actorRef;
  }, [actorRef, onActor]);
  return null;
}

function mount() {
  const actorRef = { current: null };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <EditorWorkflowContext.Provider>
        <ActorRefCapture onActor={actorRef} />
        <ToolSettingsBar />
      </EditorWorkflowContext.Provider>,
    );
  });
  return { container, root, actorRef };
}

function makeProject() {
  return {
    ...createEmptyProject(),
    bones: [
      { id: 'b1', name: 'Bone 1', parentId: null, setup: { x: 0, y: 0, rotation: 0, length: 100 } },
      { id: 'b2', name: 'Bone 2', parentId: null, setup: { x: 50, y: 0, rotation: 0, length: 100 } },
    ],
    nodes: [{
      id: 'p1',
      type: 'part',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      mesh: {
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
        triangles: [[0, 1, 2]],
        influences: [],
      },
    }],
  };
}

describe('ToolSettingsBar', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: makeProject(), hasUnsavedChanges: false });
    useEditorStore.setState({
      selection: ['p1'],
      weightPaintBoneId: 'b1',
      weightPaintBrushMode: 'add',
      weightPaintStrength: 1,
      weightPaintTargetValue: 1,
      brushSize: 30,
      brushHardness: 1,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('stays hidden for tools without settings', () => {
    const { container } = mount();
    expect(container.textContent).toBe('');
  });

  it('renders weight paint controls and updates mode', () => {
    const { container, actorRef } = mount();
    act(() => actorRef.current.send({ type: 'SET_TOOL', tool: 'weightPaint' }));

    expect(container.textContent).toContain('add');
    const subtract = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === 'subtract');
    act(() => subtract.click());
    expect(useEditorStore.getState().weightPaintBrushMode).toBe('subtract');

    expect(container.textContent).not.toContain('Target');
    act(() => useEditorStore.getState().setWeightPaintBrushMode('replace'));
    expect(container.textContent).toContain('Target');
  });

  it('renders mesh deform brush controls', () => {
    const { container, actorRef } = mount();
    act(() => actorRef.current.send({ type: 'SET_TOOL', tool: 'meshDeform' }));

    expect(container.textContent).toContain('Size');
    expect(container.textContent).toContain('Hard');
    expect(container.textContent).not.toContain('Strength');
  });

  it('renders drawBone controls and toggles chain mode', () => {
    const { container, actorRef } = mount();
    act(() => actorRef.current.send({ type: 'SET_TOOL', tool: 'drawBone' }));

    expect(container.textContent).toContain('Chain');
    expect(container.textContent).toContain('Auto-assign');
    expect(container.textContent).toContain('Mode');

    const chainSwitch = container.querySelector('#chain-mode');
    expect(chainSwitch).not.toBeNull();
    act(() => chainSwitch.click());
    expect(useEditorStore.getState().drawBoneChainMode).toBe(true);
  });

  it('updates auto-assign mode in store', () => {
    const { actorRef } = mount();
    act(() => actorRef.current.send({ type: 'SET_TOOL', tool: 'drawBone' }));
    act(() => useEditorStore.getState().setDrawBoneAutoAssignMode('classic'));
    expect(useEditorStore.getState().drawBoneAutoAssignMode).toBe('classic');
  });
});
