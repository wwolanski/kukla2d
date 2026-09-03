import type { ProjectDocument } from '@kukla2d/contracts';

import { CURRENT_PROJECT_VERSION } from '@/schema/projectSchema';

export function createEmptyProject(): ProjectDocument {
  return {
    version: CURRENT_PROJECT_VERSION,
    author: '',
    lastActiveAnimationId: null,
    canvas: {
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      presetId: 'classic-4-3',
      fitSource: null,
    },
    textures: [],
    nodes: [],
    bones: [],
    slots: [],
    attachments: [],
    skins: [],
    constraints: [],
    defaultPose: {},
    animations: [],
    physics_groups: [],
    physicsRules: [],
    libraryFolders: [],
    assetPlacements: [],
    modularSprites: [],
    controlHandles: [],
    animationModifiers: [],
  };
}
