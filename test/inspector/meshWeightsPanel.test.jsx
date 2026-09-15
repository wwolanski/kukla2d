// @vitest-environment jsdom
/* eslint-disable react/prop-types */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, useEffect } from 'react';
import { EditorWorkflowContext, useWorkflowActor } from '@/features/canvas';
import { useProjectStore } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import { createEmptyProject } from '@/core/createEmptyProject';
import { MeshWeightsPanel } from '@/features/inspector/components/node/MeshWeightsPanel.jsx';

vi.mock('@/app/providers/theme/useTheme.js', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: () => {}, resolvedTheme: 'dark' }),
}));

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function renderInto(node, element) {
  const root = createRoot(node);
  act(() => { root.render(element); });
  return root;
}

function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderInto(container, element);
  return container;
}

function ActorRefCapture({ onActor }) {
  const { actorRef } = useWorkflowActor();
  useEffect(() => {
    onActor.current = actorRef;
  }, [actorRef, onActor]);
  return null;
}

function getNode() {
  return useProjectStore.getState().project.nodes.find(n => n.id === 'p1');
}

describe('MeshWeightsPanel', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createEmptyProject(), hasUnsavedChanges: false });
    useEditorStore.setState({
      weightPaintBoneId: null,
      activeBoneId: null,
      weightPaintStrength: 1,
      selection: [],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function mountPanel(node) {
    const actorRef = { current: null };
    const container = mount(
      <EditorWorkflowContext.Provider>
        <ActorRefCapture onActor={actorRef} />
        <MeshWeightsPanel node={node} />
      </EditorWorkflowContext.Provider>,
    );
    return { container, getActor: () => actorRef.current };
  }

  function makeNode(influences) {
    return {
      id: 'p1',
      type: 'part',
      parent: null,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      opacity: 1,
      visible: true,
      draw_order: 1,
      mesh: {
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        uvs: [],
        triangles: [[0, 1, 0]],
        edgeIndices: [0, 1],
        influences: influences ?? [],
      },
    };
  }

  function makeBones() {
    return [
      {
        id: 'b1',
        name: 'Bone 1',
        parentId: null,
        setup: { x: 0, y: 0, rotation: 0, length: 100, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 },
      },
      {
        id: 'b2',
        name: 'Bone 2',
        parentId: null,
        setup: { x: 50, y: 0, rotation: 90, length: 100, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 },
      },
    ];
  }

  function findButton(container, text) {
    return Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes(text));
  }

  function findAutoCheckbox(container, boneName) {
    return container.querySelector(`input[aria-label="Use ${boneName} in Auto Weights"]`);
  }

  it('shows disabled state when no bones', () => {
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [makeNode()], bones: [] } });
    const { container } = mountPanel(makeNode());
    expect(findButton(container, 'Paint Weights')).toBeUndefined();
    expect(container.textContent).toContain('Add bones to paint weights');
  });

  it('selecting a bone sets paint target without changing inspector selection', () => {
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [makeNode()], bones: makeBones() } });
    const { container } = mountPanel(makeNode());
    const boneBtn = findButton(container, 'Bone 2');
    expect(boneBtn).toBeTruthy();
    act(() => boneBtn.click());
    expect(useEditorStore.getState().weightPaintBoneId).toBe('b2');
    expect(useEditorStore.getState().activeBoneId).toBeNull();
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('defaults to the bone structurally assigned to the image', () => {
    const node = { ...makeNode(), boneId: 'b2' };
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [node], bones: makeBones() } });
    const { container } = mountPanel(node);

    expect(container.textContent).toContain('Bone 2');
    expect(findButton(container, 'Bone 2').parentElement.className).toContain('bg-primary');
  });

  it('binds unweighted vertices to selected bone', () => {
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [makeNode()], bones: makeBones() } });
    const { container } = mountPanel(makeNode());
    act(() => findButton(container, 'Bone 1').click());
    act(() => findButton(container, 'Bind Unweighted').click());
    const mesh = getNode().mesh;
    expect(mesh.influences).toHaveLength(2);
    expect(mesh.influences[0]).toEqual([{ boneId: 'b1', weight: 1 }]);
    expect(mesh.influences[1]).toEqual([{ boneId: 'b1', weight: 1 }]);
  });

  it('binding unweighted vertices preserves existing influences', () => {
    const node = makeNode([
      [{ boneId: 'b2', weight: 1 }],
      [],
    ]);
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [node], bones: makeBones() } });
    const { container } = mountPanel(node);

    act(() => findButton(container, 'Bone 1').click());
    act(() => findButton(container, 'Bind Unweighted').click());

    expect(getNode().mesh.influences).toEqual([
      [{ boneId: 'b2', weight: 1 }],
      [{ boneId: 'b1', weight: 1 }],
    ]);
  });

  it('unbind clears influences', () => {
    const node = makeNode([[{ boneId: 'b1', weight: 1 }], [{ boneId: 'b1', weight: 1 }]]);
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [node], bones: makeBones() } });
    const { container } = mountPanel(node);
    act(() => findButton(container, 'Bone 1').click());
    act(() => findButton(container, 'Remove Influence').click());
    const mesh = getNode().mesh;
    expect(mesh.influences).toEqual([[], []]);
  });

  it('auto weights uses the explicitly selected bone when mesh is unbound', () => {
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [makeNode()], bones: makeBones() } });
    const { container } = mountPanel(makeNode());
    act(() => findButton(container, 'Bone 1').click());
    act(() => findAutoCheckbox(container, 'Bone 1').click());
    act(() => findButton(container, 'Auto Weights').click());
    const mesh = getNode().mesh;
    expect(mesh.influences).toHaveLength(2);
    expect(mesh.influences[0]).toEqual([{ boneId: 'b1', weight: 1 }]);
    expect(mesh.influences[1]).toEqual([{ boneId: 'b1', weight: 1 }]);
  });

  it('auto weights uses the explicitly checked palette', () => {
    const node = makeNode([[{ boneId: 'b1', weight: 1 }], [{ boneId: 'b1', weight: 1 }]]);
    node.mesh.vertices[1] = { x: 50, y: 0 };
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [node], bones: makeBones() } });
    const { container } = mountPanel(node);
    expect(findAutoCheckbox(container, 'Bone 1').checked).toBe(true);
    act(() => findAutoCheckbox(container, 'Bone 2').click());
    act(() => findButton(container, 'Auto Weights').click());
    const mesh = getNode().mesh;
    const usedBoneIds = new Set(mesh.influences.flatMap(list => list.map(inf => inf.boneId)));
    expect(usedBoneIds).toEqual(new Set(['b1', 'b2']));
    for (const list of mesh.influences) {
      expect(list.reduce((s, i) => s + i.weight, 0)).toBeCloseTo(1);
    }
  });

  it('does not infer an unbound fallback bone for Auto Weights', () => {
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [makeNode()], bones: makeBones() } });
    useEditorStore.setState({ weightPaintBoneId: null });
    const { container } = mountPanel(makeNode());

    expect(findButton(container, 'Auto Weights').disabled).toBe(true);
    expect(findAutoCheckbox(container, 'Bone 1').checked).toBe(false);
    expect(findAutoCheckbox(container, 'Bone 2').checked).toBe(false);
  });

  it('unchecking a bone excludes it without deleting current weights', () => {
    const node = makeNode([[{ boneId: 'b1', weight: 1 }], [{ boneId: 'b1', weight: 1 }]]);
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [node], bones: makeBones() } });
    const { container } = mountPanel(node);

    act(() => findAutoCheckbox(container, 'Bone 1').click());

    expect(getNode().meshInfluenceBoneIds).toEqual([]);
    expect(getNode().mesh.influences).toEqual([
      [{ boneId: 'b1', weight: 1 }],
      [{ boneId: 'b1', weight: 1 }],
    ]);
  });

  it('bone selection is settings-only and does not enter workflow mode', () => {
    useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [makeNode()], bones: makeBones() } });
    const { container, getActor } = mountPanel(makeNode());
    act(() => findButton(container, 'Bone 1').click());
    expect(useEditorStore.getState().weightPaintBoneId).toBe('b1');
    const actor = getActor();
    expect(actor.getSnapshot().context.weightPaintMode).toBe(false);
    expect(actor.getSnapshot().context.meshEditMode).toBe(false);
  });

  describe('tool settings ownership', () => {
    it('does not render brush mode or strength controls in inspector', () => {
      useEditorStore.setState({ weightPaintStrength: 0.75, weightPaintBrushMode: 'replace' });
      useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [makeNode()], bones: makeBones() } });
      const { container } = mountPanel(makeNode());

      expect(findButton(container, 'subtract')).toBeUndefined();
      expect(container.textContent).not.toContain('Strength');
      expect(container.textContent).not.toContain('Target');
    });
  });

  describe('weight stats', () => {
    it('shows bound and unbound vertex counts', () => {
      const influences = [
        [{ boneId: 'b1', weight: 0.5 }, { boneId: 'b2', weight: 0.5 }],
        [{ boneId: 'b1', weight: 1 }],
      ];
      const node = makeNode(influences);
      useProjectStore.setState({ project: { ...createEmptyProject(), nodes: [node], bones: makeBones() } });
      const { container } = mountPanel(node);
      act(() => findButton(container, 'Bone 1').click());
      expect(container.textContent).toContain('Bound Verts');
      expect(container.textContent).toContain('2');
      expect(container.textContent).toContain('Unbound Verts');
      expect(container.textContent).toContain('0');
    });
  });
});
