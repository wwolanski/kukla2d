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

describe('RootErrorBoundary', () => {
  let RootErrorBoundary;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/app/layout/components/RootErrorBoundary.jsx');
    RootErrorBoundary = mod.RootErrorBoundary;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('renders children when no error', () => {
    const { container } = mount(
      <RootErrorBoundary>
        <div data-testid="child">Hello</div>
      </RootErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="child"]')).not.toBeNull();
    expect(container.textContent).toContain('Hello');
  });

  it('shows fallback when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingChild = () => {
      throw new Error('Test render error');
    };

    const { container } = mount(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    );

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('[data-root-error-boundary]')).not.toBeNull();
    expect(container.textContent).toContain('Application error');
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain(`Kukla2D ${__APP_VERSION__}`);

    spy.mockRestore();
  });

  it('shows reload button in fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingChild = () => {
      throw new Error('Test');
    };

    const { container } = mount(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    );

    const reloadBtn = container.querySelector('[data-root-reload]');
    expect(reloadBtn).not.toBeNull();
    expect(reloadBtn.textContent).toContain('Reload application');

    spy.mockRestore();
  });

  it('reloads page when reload button is clicked', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalLocation = window.location;
    const mockReload = vi.fn();

    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload: mockReload },
      writable: true,
      configurable: true,
    });

    const ThrowingChild = () => {
      throw new Error('Test');
    };

    const { container } = mount(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    );

    const reloadBtn = container.querySelector('[data-root-reload]');
    act(() => { reloadBtn.click(); });

    expect(mockReload).toHaveBeenCalled();

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    spy.mockRestore();
  });

  it('does not reset store on error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const projectState = { project: { nodes: [{ id: 'test' }] } };

    const ThrowingChild = () => {
      throw new Error('Test');
    };

    mount(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    );

    expect(projectState.project.nodes).toHaveLength(1);
    expect(projectState.project.nodes[0].id).toBe('test');

    spy.mockRestore();
  });

  it('has accessible role and aria-live', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingChild = () => {
      throw new Error('Test');
    };

    const { container } = mount(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    expect(alert.getAttribute('data-root-error-boundary')).toBe('true');

    spy.mockRestore();
  });

  it('logs error to console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ThrowingChild = () => {
      throw new Error('Test error');
    };

    mount(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    );

    expect(spy).toHaveBeenCalled();
    const rootBoundaryCall = spy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('[RootErrorBoundary]'),
    );
    expect(rootBoundaryCall).toBeDefined();

    spy.mockRestore();
  });
});
