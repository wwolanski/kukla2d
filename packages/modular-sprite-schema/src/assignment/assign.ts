import { hungarian } from './hungarian.js';
import { componentUnaryScore } from '../scoring/math.js';

import type { ModularSpriteSchema, ObservedComponent, SlotAssignment, SpriteObservation } from '../contracts/index.js';

export function assignComponents(observation: SpriteObservation, schema: ModularSpriteSchema): { assignments: SlotAssignment[]; unmatchedComponentIds: number[] } {
  const expected = schema.slots.flatMap(slot => slot.components.map(component => ({ slotKey: slot.slotKey, component })));
  const costs = expected.map(item => observation.components.map(component => 1 - componentUnaryScore(component, item.component) / 10000));
  const columns = hungarian(costs); const assigned = new Set<number>();
  const perSlot = new Map<string, { ids: number[]; scores: number[] }>();
  expected.forEach((item, index) => {
    const column = columns[index] ?? -1; const actual: ObservedComponent | undefined = column >= 0 ? observation.components[column] : undefined;
    const entry = perSlot.get(item.slotKey) ?? { ids: [], scores: [] };
    if (actual && (costs[index]?.[column] ?? 1) <= 0.75) { entry.ids.push(actual.componentId); entry.scores.push(Math.round((1 - costs[index]![column]!) * 10000)); assigned.add(actual.componentId); }
    perSlot.set(item.slotKey, entry);
  });
  const assignments = schema.slots.map(slot => { const value = perSlot.get(slot.slotKey) ?? { ids: [], scores: [] }; return { slotKey: slot.slotKey, componentIds: value.ids, scoreBp: value.scores.length ? Math.round(value.scores.reduce((a, b) => a + b, 0) / value.scores.length) : 0 }; });
  return { assignments, unmatchedComponentIds: observation.components.map(item => item.componentId).filter(id => !assigned.has(id)) };
}
