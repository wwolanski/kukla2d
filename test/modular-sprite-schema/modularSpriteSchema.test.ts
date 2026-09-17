import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs3';
import { DEFAULT_MODULAR_SPRITE_RECIPE } from '@kukla2d/contracts';
import {
  DEFAULT_MATCHER_PROFILE,
  InMemorySchemaMatchGateway,
  SchemaComparisonService,
  SemanticCatalog,
  buildSchema,
  compareSchema,
  compositionId,
  ratioScore,
  sha256,
  type ModularSpriteSchema,
  type SchemaSlot,
  type SpriteObservation,
} from '@kukla2d/modular-sprite-schema';

import { BUNDLED_SCHEMAS } from '@/features/modular-sprite-schema/infrastructure/bundled/bundledSchemaSource';
import { analyzeModularSpriteBackground, processModularSprite } from '@/features/modular-sprite';

const shape = () => ({ width: 2, height: 2, data: new Uint8Array([1, 1, 1, 1]) });
const slots: SchemaSlot[] = [
  { slotKey: 'head', label: 'Head', semanticRoleId: 'builtin.part-role.head', qualifiers: {}, required: true, drawOrder: 2, components: [{ componentKey: 'head-1', bounds: { x: .4, y: .1, width: .2, height: .2 }, centroid: { x: .5, y: .2 }, foregroundAreaRatio: .03, boundingBoxAreaRatio: .04, aspectRatio: 1, shapeMask: shape() }] },
  { slotKey: 'torso', label: 'Torso', semanticRoleId: 'builtin.part-role.torso', qualifiers: {}, required: true, drawOrder: 1, components: [{ componentKey: 'torso-1', bounds: { x: .35, y: .4, width: .3, height: .4 }, centroid: { x: .5, y: .6 }, foregroundAreaRatio: .09, boundingBoxAreaRatio: .12, aspectRatio: .75, shapeMask: shape() }] },
];

function observation(scale = 1, includeTorso = true): SpriteObservation {
  const components = slots.flatMap(slot => slot.components).filter(item => includeTorso || item.componentKey !== 'torso-1').map((item, index) => ({ ...structuredClone(item), componentId: index + 1 }));
  return { observationVersion: 1, processorVersion: 1, canvas: { width: 100 * scale, height: 100 * scale, aspectRatio: 1 }, foregroundBounds: { x: .35, y: .1, width: .3, height: .7 }, components, segmentationQualityBp: 10000 };
}

function schema(id = 'schema-a'): ModularSpriteSchema {
  const built = buildSchema({ schemaId: id, name: id, observation: observation(), slots, referenceAsset: { assetId: `${id}-asset`, mimeType: 'image/png', width: 100, height: 100 } });
  built.matcherProfile.sizeRatioRules = [{ ruleId: 'head-torso', leftSlotKey: 'head', rightSlotKey: 'torso', metric: 'foreground-area', expectedRatio: 1/3, tolerance: .2, weightBp: 10000 }];
  return built;
}

async function processExample(fileName: string): Promise<SpriteObservation> {
  const png = await new Promise<PNG>((resolve, reject) => {
    const decoder = new PNG({});
    decoder.parse(
      readFileSync(new URL(`../../src/features/modular-sprite/assets/examples/${fileName}`, import.meta.url)),
      (error, parsed) => error ? reject(error) : resolve(parsed),
    );
  });
  const image = {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  };
  const recipe = structuredClone(DEFAULT_MODULAR_SPRITE_RECIPE);
  const background = analyzeModularSpriteBackground(image);
  recipe.background.mode = background.mode;
  recipe.background.color = background.color;
  return processModularSprite({ image, recipe }).observation;
}

describe('portable modular sprite schema engine', () => {
  it('uses a real deterministic SHA-256 and stable canonical composition id', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(compositionId(slots)).toBe(compositionId([...slots].reverse()));
  });

  it('keeps matching invariant across source resolution and schema ordering', () => {
    const first = schema('first');
    const displaced = schema('other');
    displaced.fingerprint.canvasAspectRatio = 2;
    displaced.slots[0]!.components[0]!.centroid.x = .05;
    const a = new SchemaComparisonService([first, displaced], 'r1').match({ requestId: '1', observation: observation(1), matcherProfileId: 'default-v1' });
    const b = new SchemaComparisonService([displaced, first], 'r1').match({ requestId: '2', observation: observation(4), matcherProfileId: 'default-v1' });
    expect(a.matches[0]?.schemaId).toBe('first');
    expect(b.matches[0]?.schemaId).toBe('first');
    expect(a.matches.find(item => item.schemaId === 'first')?.similarityBp).toBe(b.matches.find(item => item.schemaId === 'first')?.similarityBp);
  });

  it('penalizes a missing required part through coverage', () => {
    const complete = compareSchema(observation(), schema());
    const missing = compareSchema(observation(1, false), schema());
    expect(missing.missingRequiredSlots).toContain('torso');
    expect(missing.similarityBp).toBeLessThan(complete.similarityBp);
    expect(missing.analyzers.find(item => item.analyzerId === 'assignment.coverage')?.passed).toBe(false);
  });

  it('scores logarithmic ratios symmetrically', () => {
    expect(ratioScore(2, 1, .2)).toBe(ratioScore(.5, 1, .2));
  });

  it('exposes builtin and user-defined open semantics', () => {
    const catalog = new SemanticCatalog();
    catalog.upsert({ id: 'user.role.hat', revision: 1, kind: 'part-role', key: 'hat', label: 'Hat', aliases: ['cap'], origin: 'user' });
    expect(catalog.find('part-role', 'cap')?.id).toBe('user.role.hat');
    expect(catalog.find('part-role', 'upper-arm')?.origin).toBe('builtin');
  });

  it('supports cancellation at the async gateway boundary', async () => {
    const controller = new AbortController(); controller.abort();
    const gateway = new InMemorySchemaMatchGateway([schema()]);
    await expect(gateway.match({ requestId: 'cancelled', observation: observation(), matcherProfileId: DEFAULT_MATCHER_PROFILE.profileId }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('cancels cooperative catalog matching between schemas', async () => {
    let aborted = false;
    const service = new SchemaComparisonService([schema('one'), schema('two')], 'r1');
    await expect(service.matchAsync({ requestId: 'running', observation: observation(), matcherProfileId: 'default-v1' }, {
      throwIfAborted: () => { if (aborted) throw new DOMException('cancelled', 'AbortError'); },
      onProgress: event => { if (event.completed === 1) aborted = true; },
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('matches the Armored Panda reference fingerprint ahead of Arcane Wizard', () => {
    const pandaSchema = BUNDLED_SCHEMAS.find(item => item.schemaId === 'builtin.armored-panda')!;
    expect(pandaSchema.fingerprint.canvasAspectRatio).toBe(1);
    expect(pandaSchema.fingerprint.expectedIslandCount).toBe(7);
    const pandaObservation: SpriteObservation = {
      observationVersion: 1,
      processorVersion: 1,
      canvas: { width: 1254, height: 1254, aspectRatio: 1 },
      foregroundBounds: structuredClone(pandaSchema.fingerprint.foregroundBounds),
      components: pandaSchema.slots.flatMap(slot => slot.components).map((component, index) => ({ ...structuredClone(component), componentId: index + 1 })),
      segmentationQualityBp: 10000,
    };
    const response = new SchemaComparisonService(BUNDLED_SCHEMAS, 'bundled-examples').match({ requestId: 'panda-reference', observation: pandaObservation, matcherProfileId: 'default-v1' });
    expect(response.matches[0]?.schemaId).toBe('builtin.armored-panda');
    expect(response.matches[0]?.similarityBp).toBeGreaterThanOrEqual(9900);
    expect(response.matches[1]?.similarityBp).toBeLessThan(response.matches[0]!.similarityBp);
  });

  it.each([
    ['armored-panda.png', 'builtin.armored-panda'],
    ['arcane-wizard.png', 'builtin.arcane-wizard'],
  ])('matches the real %s example to its built-in schema', async (fileName, schemaId) => {
    const response = new SchemaComparisonService(BUNDLED_SCHEMAS, 'bundled-examples').match({
      requestId: fileName,
      observation: await processExample(fileName),
      matcherProfileId: 'default-v1',
    });
    expect(response.matches[0]?.schemaId).toBe(schemaId);
    expect(response.matches[0]?.verdict).toBe('match');
    expect(response.matches[0]?.analyzers.find(item => item.analyzerId === 'relations.size-ratio')?.status).toBe('scored');
  });

  it('generates size-ratio rules for saved schemas and scores them on reuse', () => {
    const generated = buildSchema({ schemaId: 'generated', name: 'Generated', observation: observation(), slots, referenceAsset: { assetId: 'generated-asset', mimeType: 'image/png', width: 100, height: 100 } });
    expect(generated.matcherProfile.sizeRatioRules).toHaveLength(1);
    const relation = compareSchema(observation(), generated).analyzers.find(item => item.analyzerId === 'relations.size-ratio');
    expect(relation).toMatchObject({ status: 'scored', scoreBp: 10000, passed: true });
  });
});
