// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import { getPreviewModifierDraft } from '@/features/auto-motion';
import { clearPreviewModifierDraft } from '@/features/auto-motion/application/previewModifierStore.js';

vi.mock('@/app/providers/theme/useTheme.js', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: () => {}, resolvedTheme: 'dark' }),
}));

import { AddMotionWizard } from '@/features/auto-motion/components/AddMotionWizard';

const mountedRoots = [];

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

function renderInto(node, element) {
  const root = createRoot(node);
  act(() => { root.render(element); });
  return root;
}

function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = renderInto(container, element);
  mountedRoots.push(root);
  return container;
}

function findDialogBtn(text) {
  return Array.from(document.body.querySelectorAll('button')).find(b =>
    b.textContent.trim() === text
  );
}

function clickPresetCard(title) {
  const heading = Array.from(document.body.querySelectorAll('h4')).find(h =>
    h.textContent.trim() === title
  );
  act(() => { heading?.click(); });
}

function makeEmptyProject() {
  return {
    version: 7,
    canvas: { width: 800, height: 600, x: 0, y: 0, bgEnabled: false, bgColor: '#ffffff' },
    textures: [],
    nodes: [],
    bones: [],
    slots: [],
    attachments: [],
    skins: [],
    constraints: [],
    defaultPose: {},
    animations: [],
    physics_groups: [],
    physicsRules: [],
    libraryFolders: [],
    assetPlacements: [],
    controlHandles: [],
    animationModifiers: [],
  };
}

describe('AddMotionWizard', () => {
  afterEach(() => {
    act(() => {
      while (mountedRoots.length) {
        mountedRoots.pop().unmount();
      }
    });
    document.body.innerHTML = '';
    clearPreviewModifierDraft();
    useEditorStore.setState({
      selection: [],
      editorMode: 'staging',
      showSkeleton: false,
      skeletonEditMode: false,
      interaction: { kind: 'idle' },
    });
    useProjectStore.setState({
      project: makeEmptyProject(),
      versionControl: { geometryVersion: 0, transformVersion: 0, textureVersion: 0 },
      hasUnsavedChanges: false,
    });
  });

  it('renders selectPreset step when open', () => {
    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Idle Breathing');
    expect(document.body.textContent).toContain('Subtle breathing motion');
  });

  it('shows Next button on preset step', () => {
    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    const nextBtn = findDialogBtn('Next');
    expect(nextBtn).toBeTruthy();
    expect(nextBtn.disabled).toBe(false);
  });

  it('disables Next on mapRoles step when chest not bound', () => {
    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    const nextBtn = findDialogBtn('Next');
    expect(nextBtn).toBeTruthy();
    expect(nextBtn.disabled).toBe(true);
    expect(document.body.textContent).toContain('Chest mapping is required');
  });

  it('enables Next on mapRoles when chest is bound with mesh', () => {
    useEditorStore.setState({ selection: ['chest-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        nodes: [{ id: 'chest-1', type: 'part', name: 'Chest', mesh: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] } }],
      },
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Use selected layer')?.click(); });
    const nextBtn = findDialogBtn('Next');
    expect(nextBtn?.disabled).toBe(false);
    expect(document.body.textContent).toContain('Chest');
  });

  it('skipping optional roles does not block creation', () => {
    useEditorStore.setState({ selection: ['chest-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        nodes: [{ id: 'chest-1', type: 'part', name: 'Chest', mesh: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] } }],
      },
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Use selected layer')?.click(); });
    const skipBtn = findDialogBtn('Skip');
    if (skipBtn) act(() => { skipBtn?.click(); });
    const nextBtn = findDialogBtn('Next');
    expect(nextBtn?.disabled).toBe(false);
  });

  it('starts canvas picking without binding the current selection immediately', () => {
    useEditorStore.setState({ selection: ['chest-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        nodes: [{ id: 'chest-1', type: 'part', name: 'Chest' }],
      },
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Select on canvas')?.click(); });

    expect(useEditorStore.getState().interaction).toEqual({
      kind: 'pendingPickAutoMotionPart',
      role: 'chest',
    });
    expect(document.body.textContent).toContain('Pick a part in the canvas');
    expect(findDialogBtn('Next')?.disabled).toBe(true);
  });

  it('binds picked canvas part after canvas selection resolves', () => {
    useEditorStore.setState({ selection: ['chest-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        nodes: [
          { id: 'chest-1', type: 'part', name: 'Chest', mesh: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] } },
          { id: 'body-2', type: 'part', name: 'Body', mesh: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] } },
        ],
      },
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Select on canvas')?.click(); });
    act(() => {
      useEditorStore.setState({
        selection: ['body-2'],
        interaction: { kind: 'idle' },
      });
    });

    expect(document.body.textContent).toContain('Body');
    expect(findDialogBtn('Next')?.disabled).toBe(false);
  });

  it('role mapping does not mutate project state before Create', () => {
    useEditorStore.setState({ selection: ['chest-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        nodes: [{ id: 'chest-1', type: 'part', name: 'Chest', mesh: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] } }],
      },
      versionControl: { geometryVersion: 0, transformVersion: 0, textureVersion: 0 },
      hasUnsavedChanges: false,
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Use selected layer')?.click(); });

    const state = useProjectStore.getState();
    expect(state.project.animationModifiers?.length ?? 0).toBe(0);
    expect(state.project.controlHandles?.length ?? 0).toBe(0);
    expect(state.hasUnsavedChanges).toBe(false);
  });

  it('Create calls store action with chest node', () => {
    const spy = vi.fn(() => ({ changed: true }));
    useEditorStore.setState({ selection: ['chest-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        nodes: [{ id: 'chest-1', type: 'part', name: 'Chest', mesh: { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] } }],
      },
      createIdleBreathingMotion: spy,
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Use selected layer')?.click(); });
    act(() => { findDialogBtn('Next')?.click(); });

    act(() => { findDialogBtn('Create')?.click(); });

    expect(spy).toHaveBeenCalledWith({
      chestNodeId: 'chest-1',
      options: expect.objectContaining({ strength: 1 }),
    });
  });

  it('blocks create when chest part has no mesh', () => {
    useEditorStore.setState({ selection: ['chest-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        nodes: [{ id: 'chest-1', type: 'part', name: 'Chest' }],
      },
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Use selected layer')?.click(); });

    expect(document.body.textContent).toContain('Chest part has no mesh');
    expect(document.body.textContent).toContain('Idle Breathing requires a mesh');

    const nextBtn = findDialogBtn('Next');
    expect(nextBtn?.disabled).toBe(true);
  });

  it('shows Head Cheek Jiggle as selectable preset', () => {
    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Head Cheek Jiggle');
    expect(document.body.textContent).toContain('Subtle cheek jiggle driven by head bone motion');
  });

  it('shows source bone selector when Head Cheek Jiggle is selected in wizard step 2', () => {
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        bones: [{ id: 'head-bone', name: 'Head', setup: { x: 0, y: 0 } }],
        nodes: [{ id: 'face-1', type: 'part', name: 'Face', mesh: { vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] } }],
      },
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);

    clickPresetCard('Head Cheek Jiggle');
    act(() => { findDialogBtn('Next')?.click(); });

    expect(document.body.textContent).toContain('Source Bone');
    expect(document.body.textContent).toContain('Head');
  });

  it('requires canvas cheek point before creating Head Cheek Jiggle', () => {
    useEditorStore.setState({ selection: ['face-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        bones: [{ id: 'head-bone', name: 'Head', setup: { x: 0, y: 0 } }],
        nodes: [{ id: 'face-1', type: 'part', name: 'Face', mesh: { vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }] } }],
      },
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    clickPresetCard('Head Cheek Jiggle');
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Use selected layer')?.click(); });

    expect(document.body.textContent).toContain('Cheek point is required');
    expect(findDialogBtn('Next')?.disabled).toBe(true);

    act(() => { findDialogBtn('Pick on canvas')?.click(); });

    expect(useEditorStore.getState().interaction).toEqual({
      kind: 'pendingPickAutoMotionPoint',
      role: 'cheekArea',
      targetNodeId: 'face-1',
    });
  });

  it('creates Head Cheek Jiggle with canvas-picked cheek point', async () => {
    const spy = vi.fn(() => ({ changed: true }));
    useEditorStore.setState({ selection: ['face-1'] });
    useProjectStore.setState({
      project: {
        ...makeEmptyProject(),
        bones: [{ id: 'head-bone', name: 'Head', setup: { x: 0, y: 0 } }],
        nodes: [{ id: 'face-1', type: 'part', name: 'Face', mesh: { vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }] } }],
      },
      createHeadCheekJiggleMotion: spy,
    });

    mount(<AddMotionWizard open={true} onClose={() => {}} />);
    clickPresetCard('Head Cheek Jiggle');
    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Use selected layer')?.click(); });
    await act(async () => {
      findDialogBtn('Pick on canvas')?.click();
      await Promise.resolve();
    });
    expect(useEditorStore.getState().interaction).toEqual({
      kind: 'pendingPickAutoMotionPoint',
      role: 'cheekArea',
      targetNodeId: 'face-1',
    });
    await act(async () => {
      useEditorStore.getState().setInteraction({
        kind: 'autoMotionPickResult',
        role: 'cheekArea',
        nodeId: 'face-1',
        localPoint: { x: 12, y: 28 },
        worldPoint: { x: 100, y: 200 },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useEditorStore.getState().interaction.kind).toBe('idle');

    expect(document.body.textContent).toContain('x 12, y 28');
    expect(findDialogBtn('Next')?.disabled).toBe(false);

    act(() => { findDialogBtn('Next')?.click(); });
    act(() => { findDialogBtn('Create')?.click(); });

    expect(spy).toHaveBeenCalledWith({
      sourceBoneId: 'head-bone',
      faceNodeId: 'face-1',
      options: expect.objectContaining({
        cheekPoint: { x: 12, y: 28 },
        params: expect.objectContaining({
          cheekPointX: 12,
          cheekPointY: 28,
        }),
      }),
    });
  });

  it('wizard closes and clears preview draft on close', () => {
    const onClose = vi.fn();
    mount(<AddMotionWizard open={true} onClose={onClose} />);

    const closeBtn = Array.from(document.body.querySelectorAll('button')).find(b =>
      b.title === 'Close'
    );
    act(() => { closeBtn?.click(); });
    expect(onClose).toHaveBeenCalled();
    expect(getPreviewModifierDraft()).toBeNull();
  });
});
