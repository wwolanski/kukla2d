import { describe, it, expect } from 'vitest';
import { createDragSession, updateDragTarget, computeDropPosition } from '@/features/layers/domain/dragSession.js';
import { validateRenameValue as validateRename, resolveDisplayName as resolveName, isSourceNameReadonly as isReadonly } from '@/features/layers/domain/inlineRename.js';
import { validateUniqueLibraryFolderName } from '@/domain/libraryFolderNames.js';

describe('createDragSession', () => {
  it('creates a session with source fields and null target', () => {
    const s = createDragSession('node', 'id-1');
    expect(s).toEqual({
      sourceKind: 'node',
      sourceId: 'id-1',
      targetKind: null,
      targetId: null,
      dropPosition: null,
    });
  });
});

describe('updateDragTarget', () => {
  it('returns a new session with target fields set', () => {
    const s = createDragSession('bone', 'b-1');
    const next = updateDragTarget(s, 'node', 'n-1', 'before');
    expect(next).toEqual({
      sourceKind: 'bone',
      sourceId: 'b-1',
      targetKind: 'node',
      targetId: 'n-1',
      dropPosition: 'before',
    });
    expect(s.targetKind).toBeNull();
  });
});

describe('computeDropPosition', () => {
  it('returns before when near top', () => {
    expect(computeDropPosition({ clientY: 10, top: 0, height: 100 }, 'inside')).toBe('before');
  });

  it('returns after when near bottom', () => {
    expect(computeDropPosition({ clientY: 90, top: 0, height: 100 }, 'inside')).toBe('after');
  });

  it('returns default in middle zone', () => {
    expect(computeDropPosition({ clientY: 50, top: 0, height: 100 }, 'inside')).toBe('inside');
  });

  it('returns default when height is zero', () => {
    expect(computeDropPosition({ clientY: 0, top: 0, height: 0 }, 'after')).toBe('after');
  });

  it('returns default when dto is missing', () => {
    expect(computeDropPosition(null, 'after')).toBe('after');
  });
});

describe('validateRenameValue', () => {
  it('returns trimmed string for valid input', () => {
    expect(validateRename('  hello  ')).toBe('hello');
  });

  it('returns null for empty string', () => {
    expect(validateRename('')).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(validateRename('   ')).toBeNull();
  });

  it('returns null for non-string', () => {
    expect(validateRename(123)).toBeNull();
  });
});

describe('resolveDisplayName', () => {
  it('returns local name when present', () => {
    expect(resolveName('local', 'source.png')).toBe('local');
  });

  it('falls back to source when local is empty', () => {
    expect(resolveName('', 'source.png')).toBe('source.png');
  });

  it('falls back to source when local is null', () => {
    expect(resolveName(null, 'source.png')).toBe('source.png');
  });

  it('returns empty when both are empty', () => {
    expect(resolveName('', '')).toBe('');
  });
});

describe('isSourceNameReadonly', () => {
  it('returns true when source differs from local', () => {
    expect(isReadonly('local', 'source.png')).toBe(true);
  });

  it('returns false when local equals source', () => {
    expect(isReadonly('source.png', 'source.png')).toBe(false);
  });

  it('returns false when no source', () => {
    expect(isReadonly('local', null)).toBe(false);
  });
});

describe('validateUniqueLibraryFolderName', () => {
  const folders = [
    { id: 'folder-hero', name: 'Hero' },
    { id: 'folder-body', name: 'Body' },
  ];

  it('rejects an imported package name that differs only by case', () => {
    expect(() => validateUniqueLibraryFolderName(folders, 'hero')).toThrow(
      'already exists',
    );
  });

  it('allows a rename to the current folder name, including a case change', () => {
    expect(
      validateUniqueLibraryFolderName(folders, 'hERO', 'folder-hero'),
    ).toBe('hERO');
  });

  it('rejects a rename to another folder name, including a case change', () => {
    expect(() =>
      validateUniqueLibraryFolderName(folders, 'bOdY', 'folder-hero'),
    ).toThrow('already exists');
  });
});
