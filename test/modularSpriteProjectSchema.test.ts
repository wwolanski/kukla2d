import { describe, expect, it } from 'vitest';

import { createEmptyProject } from '@/core/createEmptyProject';
import { removeLibraryAssets } from '@/features/layers/domain/removeLibraryAssets';
import { migrate_9_to_10 } from '@/schema/migrations/9-to-10';
import { validateProject } from '@/schema/projectSchema';

const recipe = {
  background: { mode: 'alpha' as const, color: { r: 0, g: 0, b: 0 }, tolerance: 0, softness: 0.1, despill: 0 },
  detection: { alphaThreshold: 1, minimumRegionAreaRatio: 0, openingRadius: 0, closingRadius: 0, connectivity: 8 as const },
  strokes: [],
};

function projectWithModularSprite() {
  const project = createEmptyProject();
  project.textures.push(
    { id: 'source', name: 'Source', source: 'blob:source' },
    { id: 'part', name: 'Part', source: 'blob:part' },
  );
  project.modularSprites.push({
    id: 'modular-1',
    schemaVersion: 1,
    name: 'Hero',
    sourceAssetId: 'source',
    source: { width: 16, height: 16 },
    processorVersion: 1,
    recipe,
    parts: [{
      partKey: 'head',
      assetId: 'part',
      name: 'Head',
      role: 'head',
      side: 'center',
      required: true,
      order: 0,
      extractionFrame: { x: 0, y: 0, width: 0.5, height: 0.5 },
      contentBounds: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      componentSeeds: [{ x: 0.2, y: 0.2 }],
    }],
  });
  return project;
}

describe('modular sprite project schema', () => {
  it('migrates v9 documents with an empty profile list', () => {
    const migrated = migrate_9_to_10({ version: 9 });
    expect(migrated.version).toBe(10);
    expect(migrated.modularSprites).toEqual([]);
  });

  it('accepts a complete profile', () => {
    expect(validateProject(projectWithModularSprite()).success).toBe(true);
  });

  it('rejects missing textures, duplicate part keys, and shared assets', () => {
    const project = projectWithModularSprite();
    project.modularSprites[0]!.parts.push({
      ...project.modularSprites[0]!.parts[0]!,
      assetId: 'missing',
    });
    const validation = validateProject(project);
    expect(validation.success).toBe(false);
    if (!validation.success) {
      const messages = validation.error.issues.map(issue => issue.message).join(' ');
      expect(messages).toContain('does not match any texture');
      expect(messages).toContain('Duplicate modular sprite partKey');
    }
  });

  it('deletes a complete set and all part instances when its source is removed', () => {
    const project = projectWithModularSprite();
    project.nodes.push({
      id: 'head-node', type: 'part', name: 'Head', parent: null, textureId: 'part', draw_order: 0,
      opacity: 1, visible: true, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
    });
    removeLibraryAssets(project, new Set(['source']));
    expect(project.modularSprites).toEqual([]);
    expect(project.textures).toEqual([]);
    expect(project.nodes).toEqual([]);
  });

  it('detaches a removed part without deleting the protected source profile', () => {
    const project = projectWithModularSprite();
    removeLibraryAssets(project, new Set(['part']));
    expect(project.modularSprites).toHaveLength(1);
    expect(project.modularSprites[0]!.parts).toEqual([]);
    expect(project.textures.map(texture => texture.id)).toEqual(['source']);
  });
});
