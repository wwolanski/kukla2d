// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = (relative) => readFileSync(resolve(import.meta.dirname, '../../src', relative), 'utf8');

const keyframeGuideSrc = src('features/timeline/components/KeyframeGuide.jsx');
const markerDialogSrc = src('features/timeline/components/MarkerDialog.jsx');
const timelinePanelSrc = src('features/timeline/components/TimelinePanel.jsx');
const editorWorkspaceSrc = src('app/layout/components/EditorWorkspace.jsx');

describe('Stage 05: KeyframeGuide text', () => {
  it('shows concise explicit instruction about K key', () => {
    expect(keyframeGuideSrc).toContain('Select an element, move the playhead, pose it, then press K. Smart K keys its existing animated channels.');
  });

  it('shows non-writing guide cue', () => {
    expect(keyframeGuideSrc).toContain('Guide only — clicking markers only moves the playhead.');
  });

  it('no longer shows old guide text', () => {
    expect(keyframeGuideSrc).not.toContain('move playhead, edit pose, press K');
  });
});

describe('Stage 05: Marker dialog', () => {
  it('does not contain window.prompt', () => {
    expect(markerDialogSrc).not.toContain('window.prompt');
    expect(markerDialogSrc).not.toMatch(/prompt\(/);
  });

  it('uses app Dialog component', () => {
    expect(markerDialogSrc).toMatch(/from ['"]@\/components\/ui\/dialog(?:\.jsx)?['"]/);
    expect(markerDialogSrc).toContain('<Dialog');
    expect(markerDialogSrc).toContain('<DialogContent');
  });

  it('prefills label with F{currentFrame}', () => {
    expect(markerDialogSrc).toContain('F${currentFrame}');
  });
});

describe('Stage 05: TimelinePanel marker wiring', () => {
  it('manages markerDialogOpen state', () => {
    expect(timelinePanelSrc).toContain('markerDialogOpen');
    expect(timelinePanelSrc).toContain('setMarkerDialogOpen');
  });

  it('renders MarkerDialog component', () => {
    expect(timelinePanelSrc).toContain("MarkerDialog");
    expect(timelinePanelSrc).toContain("<MarkerDialog");
  });

  it('passes onRequestMarker instead of addMarker to TransportBar', () => {
    expect(timelinePanelSrc).toContain('onRequestMarker={() => setMarkerDialogOpen(true)}');
  });
});

describe('Stage 05: EditorWorkspace layout defaults', () => {
  it('lower panels default to 25 in their local groups (no defaultSize=15)', () => {
    expect(editorWorkspaceSrc).not.toContain('defaultSize={15}');
    const matches = editorWorkspaceSrc.match(/defaultSize=\{25\}/g);
    expect(matches ? matches.length : 0).toBeGreaterThanOrEqual(2);
  });
});
