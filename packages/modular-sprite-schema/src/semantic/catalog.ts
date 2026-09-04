import type { SemanticDefinition, SemanticDefinitionKind } from '../contracts/index.js';

const roleKeys = ['head', 'torso', 'arm', 'upper-arm', 'forearm', 'hand', 'palm', 'finger', 'leg', 'thigh', 'lower-leg', 'foot', 'weapon', 'wing', 'tail', 'prop', 'accessory', 'custom'];
const typeKeys = ['humanoid', 'quadruped', 'slime', 'dragon', 'fx'];
const classKeys = ['archer', 'wizard', 'knight', 'rogue'];
const title = (key: string) => key.split('-').map(value => value[0]!.toUpperCase() + value.slice(1)).join(' ');
const definitions = (kind: SemanticDefinitionKind, keys: string[]): SemanticDefinition[] => keys.map(key => ({
  id: `builtin.${kind}.${key}`, revision: 1, kind, key, label: title(key), aliases: [], origin: 'builtin',
}));

export const BUILTIN_SEMANTIC_DEFINITIONS: readonly SemanticDefinition[] = [
  ...definitions('part-role', roleKeys), ...definitions('character-type', typeKeys), ...definitions('character-class', classKeys),
];

export class SemanticCatalog {
  readonly #definitions = new Map<string, SemanticDefinition>();
  constructor(initial: readonly SemanticDefinition[] = BUILTIN_SEMANTIC_DEFINITIONS) { for (const item of initial) this.upsert(item); }
  list(kind?: SemanticDefinitionKind): SemanticDefinition[] { return [...this.#definitions.values()].filter(item => !kind || item.kind === kind).sort((a, b) => a.label.localeCompare(b.label)); }
  get(id: string): SemanticDefinition | undefined { return this.#definitions.get(id); }
  find(kind: SemanticDefinitionKind, value: string): SemanticDefinition | undefined {
    const normalized = value.trim().toLowerCase();
    return this.list(kind).find(item => item.key === normalized || item.aliases.some(alias => alias.toLowerCase() === normalized));
  }
  upsert(definition: SemanticDefinition): void {
    if (!definition.id || !definition.key || definition.revision < 1) throw new Error('Invalid semantic definition');
    const current = this.#definitions.get(definition.id);
    if (current && current.revision > definition.revision) return;
    this.#definitions.set(definition.id, structuredClone(definition));
  }
}

export const semanticRoleIdForLegacyRole = (role: string): string | undefined =>
  BUILTIN_SEMANTIC_DEFINITIONS.find(item => item.kind === 'part-role' && item.key === role)?.id;
