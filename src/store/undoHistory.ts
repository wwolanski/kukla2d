/**
 * undoHistory — patch-based undo/redo using Immer patches.
 *
 * Provides both low-level batch API and high-level transaction API (K6).
 * No React or Zustand imports — stays free of circular dependencies.
 * projectStore imports pushPatches/isBatching/clearHistory from here.
 * useUndoRedo imports undo/redo/applyPatches from here.
 */
import "./immerPatches.js";
import { applyPatches as immerApplyPatches, type Patch } from "immer";

interface HistoryEntryMetadata {
  name: string;
  type: string;
}

interface HistoryEntry extends HistoryEntryMetadata {
  id: number;
  forwardPatches: Patch[];
  inversePatches: Patch[];
}

const MAX_HISTORY = 50;
const DEFAULT_ENTRY_META = { name: "Project edit", type: "project" };
const DEFAULT_BATCH_META = { name: "Batch edit", type: "batch" };

interface PendingPatchPair {
  forwardPatches: Patch[];
  inversePatches: Patch[];
}

let _undoStack: HistoryEntry[] = [];
let _redoStack: HistoryEntry[] = [];
let _batchDepth = 0;
let _batchAccumulatedPatches: PendingPatchPair[] = [];
let _batchMeta: HistoryEntryMetadata | null = null;
let _nextEntryId = 1;

function normalizeMeta(
  meta: Partial<HistoryEntryMetadata> | null | undefined,
  fallback: HistoryEntryMetadata,
): HistoryEntryMetadata {
  const name =
    typeof meta?.name === "string" && meta.name.trim()
      ? meta.name
      : fallback.name;
  const type =
    typeof meta?.type === "string" && meta.type.trim()
      ? meta.type
      : fallback.type;
  return { name, type };
}

export function applyPatches<State extends object>(
  state: State,
  patches: readonly Patch[],
): State {
  return immerApplyPatches(state, [...patches]);
}

/**
 * Push raw patches (low-level API). Respects active batch.
 */
export function pushPatches(
  forwardPatches: Patch[],
  inversePatches: Patch[],
): void {
  if (forwardPatches.length === 0) return;
  if (_batchDepth > 0) {
    _batchAccumulatedPatches.push({ forwardPatches, inversePatches });
    return;
  }
  _undoStack.push({
    id: _nextEntryId++,
    ...DEFAULT_ENTRY_META,
    forwardPatches,
    inversePatches,
  });
  if (_undoStack.length > MAX_HISTORY) _undoStack.shift();
  _redoStack = [];
}

/**
 * Transaction API (K6) — groups multiple patches into one named undo entry.
 *
 * @param {string} name - human-readable name for the undo entry
 * @param {string} type - semantic type (e.g., 'transform', 'brush', 'import')
 * @param {function} fn - callback that performs mutations (receives no args; uses pushPatches internally)
 */
export function transaction(name: string, type: string, fn: () => void): void {
  if (_batchDepth === 0) {
    _batchAccumulatedPatches = [];
    _batchMeta = normalizeMeta({ name, type }, DEFAULT_ENTRY_META);
  }
  _batchDepth++;
  try {
    fn();
  } finally {
    _batchDepth = Math.max(0, _batchDepth - 1);
    if (_batchDepth === 0) {
      if (_batchAccumulatedPatches.length > 0) {
        const forwardPatches = _batchAccumulatedPatches.flatMap(
          (e) => e.forwardPatches,
        );
        const inversePatches = [..._batchAccumulatedPatches]
          .reverse()
          .flatMap((e) => e.inversePatches);
        const meta = _batchMeta ?? DEFAULT_ENTRY_META;
        _undoStack.push({
          id: _nextEntryId++,
          name: meta.name,
          type: meta.type,
          forwardPatches,
          inversePatches,
        });
        if (_undoStack.length > MAX_HISTORY) _undoStack.shift();
        _redoStack = [];
      }
      _batchAccumulatedPatches = [];
      _batchMeta = null;
    }
  }
}

/**
 * Begin a batch (low-level API). Accumulates patches until endBatch.
 */
export function beginBatch(
  _project: unknown,
  meta: Partial<HistoryEntryMetadata> | null = null,
): void {
  if (_batchDepth === 0) {
    _batchAccumulatedPatches = [];
    _batchMeta = normalizeMeta(meta, DEFAULT_BATCH_META);
  }
  _batchDepth++;
}

/**
 * End a batch and flush accumulated patches as one undo entry.
 */
export function endBatch(): void {
  _batchDepth = Math.max(0, _batchDepth - 1);
  if (_batchDepth === 0) {
    if (_batchAccumulatedPatches.length > 0) {
      const forwardPatches = _batchAccumulatedPatches.flatMap(
        (e) => e.forwardPatches,
      );
      const inversePatches = [..._batchAccumulatedPatches]
        .reverse()
        .flatMap((e) => e.inversePatches);
      const meta = _batchMeta ?? DEFAULT_BATCH_META;
      _undoStack.push({
        id: _nextEntryId++,
        name: meta.name,
        type: meta.type,
        forwardPatches,
        inversePatches,
      });
      if (_undoStack.length > MAX_HISTORY) _undoStack.shift();
      _redoStack = [];
    }
    _batchAccumulatedPatches = [];
    _batchMeta = null;
  }
}

export function isBatching(): boolean {
  return _batchDepth > 0;
}

export function clearHistory(): void {
  _undoStack = [];
  _redoStack = [];
  _batchDepth = 0;
  _batchAccumulatedPatches = [];
  _batchMeta = null;
}

/**
 * Apply undo.
 * @param {function} applyFn - receives inversePatches; should apply them to restore project state
 */
export function undo(applyFn: (patches: readonly Patch[]) => void): boolean {
  if (_undoStack.length === 0) return false;
  const entry = _undoStack.pop();
  if (!entry) return false;
  _redoStack.push(entry);
  applyFn(entry.inversePatches);
  return true;
}

/**
 * Apply redo.
 * @param {function} applyFn - receives forwardPatches; should apply them to restore project state
 */
export function redo(applyFn: (patches: readonly Patch[]) => void): boolean {
  if (_redoStack.length === 0) return false;
  const entry = _redoStack.pop();
  if (!entry) return false;
  _undoStack.push(entry);
  applyFn(entry.forwardPatches);
  return true;
}

export function undoCount(): number {
  return _undoStack.length;
}

export function redoCount(): number {
  return _redoStack.length;
}

/**
 * Check if undo is available.
 */
export function canUndo(): boolean {
  return _undoStack.length > 0;
}

/**
 * Check if redo is available.
 */
export function canRedo(): boolean {
  return _redoStack.length > 0;
}

/**
 * Peek at the top undo entry metadata (without removing it).
 * Returns { id, name, type } or null.
 */
export function peekUndo(): Pick<HistoryEntry, "id" | "name" | "type"> | null {
  if (_undoStack.length === 0) return null;
  const entry = _undoStack[_undoStack.length - 1];
  if (!entry) return null;
  return { id: entry.id, name: entry.name, type: entry.type };
}
