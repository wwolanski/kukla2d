import type { ControlHandle, PartNode, ProjectDocument } from '@kukla2d/contracts';

import { uid } from '@/lib/uid.js';

type CreateControlHandleInput = Omit<ControlHandle, 'id' | 'locked' | 'source' | 'name' | 'space' | 'target' | 'position'> & {
  name?: string;
  role: string;
  space?: ControlHandle['space'];
  target?: ControlHandle['target'];
  position?: ControlHandle['position'];
};

export function createControlHandle({ name, role, space, target, position, radius }: CreateControlHandleInput): ControlHandle {
  const handle: ControlHandle = {
    id: uid(),
    name: name ?? role,
    role,
    space: space ?? 'canvas',
    target: target ?? { kind: 'part', id: '' },
    position: position ?? { x: 0, y: 0 },
    locked: false,
    source: 'auto-motion',
  };
  if (radius !== undefined) handle.radius = radius;
  return handle;
}

export function findHandleByRole(project: ProjectDocument, role: string): ControlHandle | null {
  return (project.controlHandles ?? []).find(h => h.role === role) ?? null;
}

export function findHandlesBySource(project: ProjectDocument, source: string): ControlHandle[] {
  return (project.controlHandles ?? []).filter(h => h.source === source);
}

export function computePartCenter(partNode: PartNode | null | undefined): { x: number; y: number } {
  if (!partNode?.mesh?.vertices?.length) return { x: 0, y: 0 };
  const verts = partNode.mesh.vertices;
  let cx = 0, cy = 0;
  for (const v of verts) {
    cx += v.x;
    cy += v.y;
  }
  return { x: cx / verts.length, y: cy / verts.length };
}
