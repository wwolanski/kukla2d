import { describe, expect, it } from 'vitest';
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

  it('matches the real V2 reference fingerprint ahead of the wizard layout', () => {
    const v2Schema = BUNDLED_SCHEMAS.find(item => item.schemaId === 'builtin.v2-example')!;
    expect(v2Schema.fingerprint.canvasAspectRatio).toBeCloseTo(1145 / 1374, 10);
    expect(v2Schema.fingerprint.expectedIslandCount).toBe(7);
    const v2Observation: SpriteObservation = {
      observationVersion: 1,
      processorVersion: 1,
      canvas: { width: 1145, height: 1374, aspectRatio: 1145 / 1374 },
      foregroundBounds: structuredClone(v2Schema.fingerprint.foregroundBounds),
      components: v2Schema.slots.flatMap(slot => slot.components).map((component, index) => ({ ...structuredClone(component), componentId: index + 1 })),
      segmentationQualityBp: 10000,
    };
    const response = new SchemaComparisonService(BUNDLED_SCHEMAS, 'bundled-v2').match({ requestId: 'v2-reference', observation: v2Observation, matcherProfileId: 'default-v1' });
    expect(response.matches[0]?.schemaId).toBe('builtin.v2-example');
    expect(response.matches[0]?.similarityBp).toBeGreaterThanOrEqual(9900);
    expect(response.matches[1]?.similarityBp).toBeLessThan(response.matches[0]!.similarityBp);
  });
});
