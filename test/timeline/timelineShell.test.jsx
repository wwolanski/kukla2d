import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = (relative) => readFileSync(resolve(import.meta.dirname, '../../src', relative), 'utf8');

const timelinePanelSrc = src('features/timeline/components/TimelinePanel.jsx');
const animationListPanelSrc = src('features/timeline/components/AnimationListPanel.jsx');
const transportBarSrc = src('features/timeline/components/TransportBar.jsx');

describe('TimelinePanel shell boundary', () => {
  it('does not import useProjectStore', () => {
    expect(timelinePanelSrc).not.toMatch(/import\s*\{[^}]*useProjectStore[^}]*\}\s*from\s*['"]@\/store\/projectStore['"]/);
  });

  it('does not import useAnimationStore', () => {
    expect(timelinePanelSrc).not.toMatch(/import\s*\{[^}]*useAnimationStore[^}]*\}\s*from\s*['"]@\/store\/animationStore['"]/);
  });

  it('does not import useEditorStore', () => {
    expect(timelinePanelSrc).not.toMatch(/import\s*\{[^}]*useEditorStore[^}]*\}\s*from\s*['"]@\/store\/editorStore['"]/);
  });

  it('does not import createTimelineCommandApi', () => {
    expect(timelinePanelSrc).not.toMatch(/import\s*\{[^}]*createTimelineCommandApi[^}]*\}\s*from/);
  });

  it('uses useTimelineController', () => {
    expect(timelinePanelSrc).toContain('useTimelineController');
  });

  it('contains horizontal overflow inside the timeline and allows its toolbar to wrap', () => {
    expect(timelinePanelSrc).toContain('min-h-0 min-w-0 flex-col overflow-hidden');
    expect(timelinePanelSrc).toContain('overflow-x-hidden overflow-y-auto');
    expect(transportBarSrc).toContain('flex-wrap');
    expect(transportBarSrc).toContain('overflow-x-hidden');
  });
});

describe('AnimationListPanel shell boundary', () => {
  it('does not import useProjectStore', () => {
    expect(animationListPanelSrc).not.toMatch(/import\s*\{[^}]*useProjectStore[^}]*\}\s*from\s*['"]@\/store\/projectStore['"]/);
  });

  it('does not import useAnimationStore', () => {
    expect(animationListPanelSrc).not.toMatch(/import\s*\{[^}]*useAnimationStore[^}]*\}\s*from\s*['"]@\/store\/animationStore['"]/);
  });

  it('does not import createTimelineCommandApi', () => {
    expect(animationListPanelSrc).not.toMatch(/import\s*\{[^}]*createTimelineCommandApi[^}]*\}\s*from/);
  });

  it('uses useTimelineController', () => {
    expect(animationListPanelSrc).toContain('useTimelineController');
  });

  it('delegates create to ctrl.createClip', () => {
    expect(animationListPanelSrc).toContain('ctrl.createClip');
  });

  it('delegates rename to ctrl.renameClip', () => {
    expect(animationListPanelSrc).toContain('ctrl.renameClip');
  });

  it('delegates delete to ctrl.deleteClip', () => {
    expect(animationListPanelSrc).toContain('ctrl.deleteClip');
  });

  it('delegates select to ctrl.selectClip', () => {
    expect(animationListPanelSrc).toContain('ctrl.selectClip');
  });
});

describe('TransportBar shell boundary', () => {
  it('does not import useAnimationStore', () => {
    expect(transportBarSrc).not.toMatch(/import\s*\{[^}]*useAnimationStore[^}]*\}\s*from\s*['"]@\/store\/animationStore['"]/);
  });

  it('does not import useProjectStore', () => {
    expect(transportBarSrc).not.toMatch(/import\s*\{[^}]*useProjectStore[^}]*\}\s*from\s*['"]@\/store\/projectStore['"]/);
  });

  it('does not import useEditorStore', () => {
    expect(transportBarSrc).not.toMatch(/import\s*\{[^}]*useEditorStore[^}]*\}\s*from\s*['"]@\/store\/editorStore['"]/);
  });

  it('receives onRequestMarker instead of addMarker', () => {
    expect(transportBarSrc).not.toMatch(/\baddMarker\b/);
    expect(transportBarSrc).toMatch(/onRequestMarker/);
  });

  it('action buttons use hover:text-foreground and transition-colors class pattern', () => {
    expect(transportBarSrc).toContain('hover:text-foreground');
    expect(transportBarSrc).toContain('hover:bg-muted');
    expect(transportBarSrc).toContain('transition-colors');
  });

  it('imports toast from use-toast', () => {
    expect(transportBarSrc).toMatch(
      /import \{ toast \} from ['"]@\/components\/ui\/use-toast(?:\.js)?['"]/
    );
  });

  it('receives isPlaying via props', () => {
    expect(transportBarSrc).toMatch(/isPlaying[,}]/);
  });

  it('receives play/pause/stop via props', () => {
    expect(transportBarSrc).toMatch(/play[,}]/);
    expect(transportBarSrc).toMatch(/pause[,}]/);
    expect(transportBarSrc).toMatch(/stop[,}]/);
  });

  it('receives loop/speed/loopKeyframes via props', () => {
    expect(transportBarSrc).toMatch(/loop[,}]/);
    expect(transportBarSrc).toMatch(/speed[,}]/);
    expect(transportBarSrc).toMatch(/loopKeyframes[,}]/);
  });

  it('receives seekFrame/setLoop/setSpeed/setLoopKeyframes/setStartFrame via props', () => {
    expect(transportBarSrc).toMatch(/seekFrame[,}]/);
    expect(transportBarSrc).toMatch(/setLoop[,}]/);
    expect(transportBarSrc).toMatch(/setSpeed[,}]/);
    expect(transportBarSrc).toMatch(/setLoopKeyframes[,}]/);
    expect(transportBarSrc).toMatch(/setStartFrame[,}]/);
  });

  it('calls play/pause instead of store methods', () => {
    expect(transportBarSrc).toContain('play()');
    expect(transportBarSrc).toContain('pause()');
    expect(transportBarSrc).not.toMatch(/anim\.play\(\)/);
    expect(transportBarSrc).not.toMatch(/anim\.pause\(\)/);
  });

  it('calls stop instead of store methods', () => {
    expect(transportBarSrc).toContain('onClick={stop}');
    expect(transportBarSrc).not.toMatch(/anim\.stop\(\)/);
  });

  it('calls seekFrame instead of store methods', () => {
    expect(transportBarSrc).toContain('seekFrame(');
    expect(transportBarSrc).not.toMatch(/anim\.seekFrame\(/);
  });

  it('uses loop prop instead of store', () => {
    expect(transportBarSrc).toContain('setLoop(!loop)');
    expect(transportBarSrc).not.toMatch(/anim\.setLoop\(/);
  });

  it('uses speed prop instead of store', () => {
    expect(transportBarSrc).toContain('value={speed}');
    expect(transportBarSrc).not.toMatch(/anim\.speed/);
  });

  it('uses loopKeyframes prop instead of store', () => {
    expect(transportBarSrc).toContain('active={loopKeyframes}');
    expect(transportBarSrc).not.toMatch(/anim\.loopKeyframes/);
  });
});

describe('useAnimationBootstrap shell boundary', () => {
  it('does not import any store', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../../src/features/timeline/application/useAnimationBootstrap.ts'), 'utf8');
    expect(src).not.toMatch(/import.*from\s*['"]@\/store\//);
  });
});
