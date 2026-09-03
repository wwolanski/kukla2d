import type { ProjectDocument, Mesh, Node } from '@kukla2d/contracts';

import { pickPersistedProjectFields } from './projectDocumentAdapter.js';
import { validateProject } from './projectSchema.js';

type PortableMesh = Omit<Mesh, 'uvs'> & { uvs: number[] };

type PortablePartNode = Omit<
  Extract<Node, { type: 'part' }>,
  'mesh'
> & { mesh?: PortableMesh | null };

type PortableNode = PortablePartNode | Extract<Node, { type: 'group' | 'warpDeformer' }>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface PortableProjectDocument {
  version: number;
  author: ProjectDocument['author'];
  lastActiveAnimationId: ProjectDocument['lastActiveAnimationId'];
  canvas: ProjectDocument['canvas'];
  textures: ProjectDocument['textures'];
  nodes: PortableNode[];
  bones: ProjectDocument['bones'];
  slots: ProjectDocument['slots'];
  attachments: ProjectDocument['attachments'];
  skins: ProjectDocument['skins'];
  constraints: ProjectDocument['constraints'];
  defaultPose: ProjectDocument['defaultPose'];
  animations: ProjectDocument['animations'];
  physics_groups: ProjectDocument['physics_groups'];
  physicsRules: ProjectDocument['physicsRules'];
  libraryFolders: ProjectDocument['libraryFolders'];
  assetPlacements: ProjectDocument['assetPlacements'];
  modularSprites: ProjectDocument['modularSprites'];
  controlHandles: ProjectDocument['controlHandles'];
  animationModifiers: ProjectDocument['animationModifiers'];
}

function deepCloneJsonSafe(value: unknown): unknown {
  if (value === null) return value;
  if (value === undefined) throw new Error('undefined at $ is not JSON-safe');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number "${String(value)}" is not JSON-safe`);
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Int8Array) return Array.from(value);
  if (value instanceof Uint8Array) return Array.from(value);
  if (value instanceof Uint8ClampedArray) return Array.from(value);
  if (value instanceof Int16Array) return Array.from(value);
  if (value instanceof Uint16Array) return Array.from(value);
  if (value instanceof Int32Array) return Array.from(value);
  if (value instanceof Uint32Array) return Array.from(value);
  if (value instanceof Float32Array) return Array.from(value);
  if (value instanceof Float64Array) return Array.from(value);
  if (value instanceof Set) return Array.from(value, deepCloneJsonSafe);
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value, ([key, entryValue]) => [String(key), deepCloneJsonSafe(entryValue)]),
    );
  }
  if (Array.isArray(value)) return value.map(deepCloneJsonSafe);
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error(`${value.constructor.name} is not JSON-safe`);
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const entryValue = (value as Record<string, unknown>)[key];
      // JSON.stringify omits undefined object properties. Mirror that behavior
      // explicitly so returned snapshots contain no values outside JsonValue.
      if (entryValue !== undefined) out[key] = deepCloneJsonSafe(entryValue);
    }
    return out;
  }
  throw new Error(`${typeof value} is not JSON-safe`);
}

function normalizeMeshForPortable(mesh: Mesh | null | undefined): PortableMesh | null | undefined {
  if (!mesh) return mesh;
  return {
    ...mesh,
    uvs: Array.isArray(mesh.uvs) ? [...mesh.uvs] : Array.from(mesh.uvs),
    edgeIndices: Array.isArray(mesh.edgeIndices) ? [...mesh.edgeIndices] : Array.from(mesh.edgeIndices),
    ...(mesh.boneWeights ? { boneWeights: Array.isArray(mesh.boneWeights) ? [...mesh.boneWeights] : Array.from(mesh.boneWeights) } : {}),
  };
}

export function createPortableProjectSnapshot(project: ProjectDocument): PortableProjectDocument {
  const cloned = deepCloneJsonSafe(pickPersistedProjectFields(project));
  assertJsonSafe(cloned);
  assertPortableProjectDocument(cloned);
  const snapshot = cloned;

  if (Array.isArray(snapshot.nodes)) {
    snapshot.nodes = snapshot.nodes.map((node) => {
      if (node.type === 'part' && node.mesh) {
        return { ...node, mesh: normalizeMeshForPortable(node.mesh) } as PortableNode;
      }
      return node;
    });
  }

  return snapshot;
}

function assertPortableProjectDocument(value: unknown): asserts value is PortableProjectDocument {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { nodes?: unknown }).nodes)) {
    throw new Error('Portable snapshot nodes are missing');
  }
  for (const node of (value as { nodes: unknown[] }).nodes) {
    if (!node || typeof node !== 'object') throw new Error('Portable snapshot contains an invalid node');
    const part = node as { type?: unknown; mesh?: { uvs?: unknown } | null };
    if (part.type === 'part' && part.mesh && !Array.isArray(part.mesh.uvs)) {
      throw new Error('Portable snapshot mesh UVs must be arrays');
    }
  }
}

export function assertJsonSafe(value: unknown, path = '$'): asserts value is JsonValue {
  assertJsonSafeRecursive(value, path, new WeakSet<object>());
}

function assertJsonSafeRecursive(value: unknown, path: string, ancestors: WeakSet<object>): asserts value is JsonValue {
  if (value === null) return;
  if (value === undefined) throw new Error(`undefined at ${path} is not JSON-safe`);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path} is not JSON-safe`);
    return;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return;
  if (
    value instanceof Int8Array || value instanceof Uint8Array || value instanceof Uint8ClampedArray ||
    value instanceof Int16Array || value instanceof Uint16Array ||
    value instanceof Int32Array || value instanceof Uint32Array ||
    value instanceof Float32Array || value instanceof Float64Array
  ) {
    throw new Error(`TypedArray at ${path} is not JSON-safe`);
  }
  if (value instanceof Set || value instanceof Map) {
    throw new Error(`${value.constructor.name} at ${path} is not JSON-safe`);
  }
  if (typeof value !== 'object') {
    throw new Error(`${typeof value} at ${path} is not JSON-safe`);
  }
  if (ancestors.has(value)) {
    throw new Error(`Circular reference at ${path} is not JSON-safe`);
  }
  ancestors.add(value);
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    for (const key of Object.keys(value)) {
      assertJsonSafeRecursive((value as Record<string, unknown>)[key], `${path}.${key}`, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertJsonSafeRecursive(value[i], `${path}[${i}]`, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  ancestors.delete(value);
  throw new Error(`${value.constructor.name} at ${path} is not JSON-safe`);
}

export function validatePortableSnapshot(snapshot: unknown): ReturnType<typeof validateProject> {
  return validateProject(snapshot);
}
