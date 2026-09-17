import { Crop, Eye, EyeOff } from 'lucide-react';
import { useEffect, useCallback, useRef } from 'react';

import { useTheme } from '@/app/providers/theme/useTheme.js';

import { useEditorStore } from '@/store/editorStore.js';

import { cn } from '@/lib/utils.js';

const BG_OPTIONS = [
  { value: 'checker', label: 'Checker background' },
  { value: 'white', label: 'White background' },
  { value: 'neutral', label: 'Neutral background' },
];

function backgroundStyle(bg, resolvedTheme) {
  if (bg === 'white') return { backgroundColor: '#ffffff' };
  if (bg === 'checker') {
    const c1 = resolvedTheme === 'dark' ? '#181818' : '#d0d0d0';
    const c2 = resolvedTheme === 'dark' ? '#282828' : '#e0e0e0';
    const size = 16;
    return {
      backgroundImage:
        `repeating-conic-gradient(${c1} 0% 25%, ${c2} 0% 50%)`,
      backgroundSize: `${size}px ${size}px`,
    };
  }
  return { backgroundColor: '#1a1a1a' };
}

export default function CanvasSurface({
  canvasRef,
  handlers,
  toolCursor,
  editorState,
  canvasBackground = 'neutral',
  editorMode = 'staging',
  showSkeleton = true,
  showExportArea = false,
  onBackgroundChange,
  onToggleArmature,
  onToggleExportArea,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onPointerDownCapture,
  children,
}) {
  const { themeMode, osTheme } = useTheme();
  const resolvedTheme = themeMode === 'system'
    ? osTheme
    : (themeMode ?? (document.documentElement.classList.contains('light') ? 'light' : 'dark'));
  const setInteractionOwner = useEditorStore((s) => s.setInteractionOwner);
  const surfaceRef = useRef(null);

  const handleOwnerPointerDown = useCallback((e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable) return;
    setInteractionOwner('canvas');
  }, [setInteractionOwner]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const handleFocusIn = () => setInteractionOwner('canvas');
    el.addEventListener('focusin', handleFocusIn);
    return () => el.removeEventListener('focusin', handleFocusIn);
  }, [setInteractionOwner]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handlers.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', handlers.onContextMenu);
    return () => {
      canvas.removeEventListener('wheel', handlers.onWheel);
      canvas.removeEventListener('contextmenu', handlers.onContextMenu);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [handlers.onWheel, handlers.onContextMenu]);

  const isStaging = editorMode === 'staging';

  return (
    <div
      ref={surfaceRef}
      data-canvas-surface="true"
      data-editor-mode={editorMode}
      data-canvas-background={canvasBackground}
      data-interaction-owner="canvas"
      tabIndex={-1}
      className="w-full h-full relative overflow-hidden outline-none"
      style={{
        ...(isStaging ? { outline: '2px solid var(--primary)', outlineOffset: '-2px' } : {}),
      }}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={handleOwnerPointerDown}
    >
      <div
        data-canvas-bg-layer="true"
        className="absolute inset-0 pointer-events-none"
        style={backgroundStyle(canvasBackground, resolvedTheme)}
      />
      <canvas
        ref={canvasRef}
        className="w-full h-full block relative z-10"
        style={{
          cursor: (editorState.weightPaintMode || (editorState.meshEditMode && editorState.meshSubMode === 'deform')) ? 'none' : toolCursor,
          touchAction: 'none',
        }}
      />

      <div className="absolute top-2 left-2 z-30 flex gap-1" data-bg-switcher="true">
        {BG_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-label={opt.label}
            aria-pressed={canvasBackground === opt.value}
            title={opt.label}
            className="flex h-7 w-7 items-center justify-center rounded border bg-background p-1 transition-colors"
            style={{
              borderColor: canvasBackground === opt.value ? 'var(--primary)' : 'var(--border)',
              boxShadow: canvasBackground === opt.value ? '0 0 0 1px var(--primary)' : 'none',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onBackgroundChange?.(opt.value)}
          >
            <span
              data-bg-preview={opt.value}
              className="h-full w-full rounded-[2px] border border-black/20"
              style={backgroundStyle(opt.value, resolvedTheme)}
            />
          </button>
        ))}
        <button
          type="button"
          aria-label="Toggle armature overlays"
          aria-pressed={showSkeleton}
          title={showSkeleton ? 'Hide armature overlays' : 'Show armature overlays'}
          className={cn(
            'flex h-7 items-center gap-1 rounded border bg-background px-2 text-[10px] font-medium transition-colors',
            showSkeleton
              ? 'border-primary text-primary'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onToggleArmature?.()}
        >
          {showSkeleton ? (
            <EyeOff size={12} className="shrink-0" />
          ) : (
            <Eye size={12} className="shrink-0" />
          )}
          <span className="whitespace-nowrap">{showSkeleton ? 'Hide Armature' : 'Show Armature'}</span>
        </button>
        <button
          type="button"
          aria-label="Toggle export area"
          aria-pressed={showExportArea}
          title={showExportArea ? 'Hide export area' : 'Show export area'}
          className={cn(
            'flex h-7 items-center gap-1 rounded border bg-background px-2 text-[10px] font-medium transition-colors',
            showExportArea
              ? 'border-primary text-primary'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onToggleExportArea?.()}
        >
          <Crop size={12} className="shrink-0" />
          <span className="whitespace-nowrap">
            {showExportArea ? 'Hide Export Area' : 'Show Export Area'}
          </span>
        </button>
      </div>

      {children}
    </div>
  );
}
