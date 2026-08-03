// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return { container, root };
}

describe('canvas failure containment', () => {
  let CANVAS_FAILURE_CODES;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/features/canvas/application/useCanvasScene.js');
    CANVAS_FAILURE_CODES = mod.CANVAS_FAILURE_CODES;
  });

  it('exports CANVAS_FAILURE_CODES with expected values', () => {
    expect(CANVAS_FAILURE_CODES).toEqual({
      INIT_UNAVAILABLE: 'CANVAS_INIT_UNAVAILABLE',
      INIT_FAILED: 'CANVAS_INIT_FAILED',
    });
  });

  it('INIT_UNAVAILABLE code is a stable string', () => {
    expect(typeof CANVAS_FAILURE_CODES.INIT_UNAVAILABLE).toBe('string');
    expect(CANVAS_FAILURE_CODES.INIT_UNAVAILABLE.length).toBeGreaterThan(0);
  });

  it('INIT_FAILED code is a stable string', () => {
    expect(typeof CANVAS_FAILURE_CODES.INIT_FAILED).toBe('string');
    expect(CANVAS_FAILURE_CODES.INIT_FAILED.length).toBeGreaterThan(0);
  });
});

describe('CanvasFailureFallback component', () => {
  let CanvasFailureFallback;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('lucide-react', () => ({
      AlertTriangle: (props) => <span data-testid="alert-icon" {...props} />,
      RotateCcw: (props) => <span data-testid="retry-icon" {...props} />,
    }));
    const mod = await import('@/features/canvas/components/CanvasFailureFallback.jsx');
    CanvasFailureFallback = mod.default;
  });

  afterEach(() => {
    vi.doUnmock('lucide-react');
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('renders null when failure is null', () => {
    const { container } = mount(
      <CanvasFailureFallback failure={null} onRetry={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders failure panel when failure is provided', () => {
    const failure = { code: 'CANVAS_INIT_FAILED', message: 'Test error message' };
    const { container } = mount(
      <CanvasFailureFallback failure={failure} onRetry={vi.fn()} />,
    );

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('[data-canvas-failure]')).not.toBeNull();
    expect(container.textContent).toContain('Canvas unavailable');
    expect(container.textContent).toContain('Test error message');
  });

  it('shows retry and reload buttons', () => {
    const failure = { code: 'CANVAS_INIT_FAILED', message: 'Error' };
    const { container } = mount(
      <CanvasFailureFallback failure={failure} onRetry={vi.fn()} />,
    );

    expect(container.querySelector('[data-canvas-retry]')).not.toBeNull();
    expect(container.querySelector('[data-canvas-reload]')).not.toBeNull();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    const failure = { code: 'CANVAS_INIT_FAILED', message: 'Error' };
    const { container } = mount(
      <CanvasFailureFallback failure={failure} onRetry={onRetry} />,
    );

    const retryBtn = container.querySelector('[data-canvas-retry]');
    expect(retryBtn).not.toBeNull();
    act(() => { retryBtn.click(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has accessible aria-live', () => {
    const failure = { code: 'CANVAS_INIT_FAILED', message: 'Error' };
    const { container } = mount(
      <CanvasFailureFallback failure={failure} onRetry={vi.fn()} />,
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.getAttribute('aria-live')).toBe('assertive');
  });

  it('shows beta version text', () => {
    const failure = { code: 'CANVAS_INIT_FAILED', message: 'Error' };
    const { container } = mount(
      <CanvasFailureFallback failure={failure} onRetry={vi.fn()} />,
    );

    expect(container.textContent).toContain(`Kukla2D ${__APP_VERSION__}`);
  });
});
