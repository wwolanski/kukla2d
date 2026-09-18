import { describe, it, expect } from 'vitest';

function getLayoutConfig({ editorStarted, isAnimationMode }) {
  const defaultSidePanelSize = 22;
  const rootPanels = [];
  if (editorStarted) {
    rootPanels.push({ id: 'layers-panel', order: 1, defaultSize: defaultSidePanelSize });
  }
  rootPanels.push({
    id: 'center-panel',
    order: 2,
    defaultSize: editorStarted ? 100 - defaultSidePanelSize * 2 : 100,
  });
  if (editorStarted) {
    rootPanels.push({ id: 'inspector-panel', order: 3, defaultSize: defaultSidePanelSize });
  }

  const centerPanels = [
    {
      id: 'canvas-panel',
      order: 1,
      defaultSize: isAnimationMode ? 75 : 100,
    },
  ];
  if (isAnimationMode) {
    centerPanels.push({ id: 'timeline-panel', order: 2, defaultSize: 25 });
  }

  const inspectorPanels = [
    {
      id: 'inspector-column',
      order: 1,
      defaultSize: isAnimationMode ? 75 : 100,
    },
  ];
  if (isAnimationMode) {
    inspectorPanels.push({
      id: 'animation-list-panel',
      order: 2,
      defaultSize: 25,
    });
  }

  return { rootPanels, centerPanels, inspectorPanels };
}

function sumSizes(panels) {
  return panels.reduce((s, p) => s + p.defaultSize, 0);
}

const scenarios = [
  { label: 'no project', editorStarted: false, isAnimationMode: false },
  { label: 'staging', editorStarted: true, isAnimationMode: false },
  { label: 'animation', editorStarted: true, isAnimationMode: true },
];

describe('EditorWorkspace layout contract', () => {
  for (const { label, editorStarted, isAnimationMode } of scenarios) {
    describe(label, () => {
      const { rootPanels, centerPanels, inspectorPanels } = getLayoutConfig({
        editorStarted,
        isAnimationMode,
      });

      it('root group sums to 100', () => {
        expect(sumSizes(rootPanels)).toBe(100);
      });

      it('center group sums to 100', () => {
        expect(sumSizes(centerPanels)).toBe(100);
      });

      if (editorStarted) {
        it('inspector group sums to 100', () => {
          expect(sumSizes(inspectorPanels)).toBe(100);
        });
      }
    });
  }

  it('panel IDs are stable across modes', () => {
    const idsByMode = {};
    for (const s of scenarios) {
      const { rootPanels, centerPanels, inspectorPanels } = getLayoutConfig(s);
      idsByMode[s.label] = new Set(
        [...rootPanels, ...centerPanels, ...inspectorPanels].map((p) => p.id),
      );
    }

    for (const panelId of idsByMode.staging) {
      expect(idsByMode.animation.has(panelId)).toBe(true);
    }
  });

  it('panel orders are stable across modes', () => {
    const orderMap = new Map();
    for (const s of scenarios) {
      const { rootPanels, centerPanels, inspectorPanels } = getLayoutConfig(s);
      for (const p of [...rootPanels, ...centerPanels, ...inspectorPanels]) {
        const prev = orderMap.get(p.id);
        if (prev !== undefined) {
          expect(p.order).toBe(prev);
        } else {
          orderMap.set(p.id, p.order);
        }
      }
    }
  });
});
