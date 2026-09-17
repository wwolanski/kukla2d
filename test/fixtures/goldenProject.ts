import { CURRENT_PROJECT_VERSION } from '../../src/schema/projectSchema';

export function createGoldenProject() {
  return {
    version: CURRENT_PROJECT_VERSION,
    author: 'Golden Author',
    lastActiveAnimationId: 'anim-idle',
    canvas: { width: 800, height: 600, x: 0, y: 0 },
    textures: [
      { id: 'tex-face', source: 'textures/tex-face.png', fileName: 'face.png', fileSize: 12345 },
    ],
    nodes: [
      {
        id: 'head',
        type: 'group',
        name: 'Head',
        parent: null,
        opacity: 1,
        visible: true,
        transform: { x: 400, y: 200, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
      {
        id: 'face',
        type: 'part',
        name: 'Face',
        parent: 'head',
        draw_order: 0,
        opacity: 1,
        visible: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 50, pivotY: 50 },
        textureId: 'tex-face',
        imageWidth: 100,
        imageHeight: 100,
        mesh: {
          vertices: [
            { x: 0, y: 0, restX: 0, restY: 0 },
            { x: 100, y: 0, restX: 100, restY: 0 },
            { x: 100, y: 100, restX: 100, restY: 100 },
            { x: 0, y: 100, restX: 0, restY: 100 },
          ],
          uvs: [0, 0, 1, 0, 1, 1, 0, 1],
          triangles: [[0, 1, 2], [0, 2, 3]],
          edgeIndices: [0, 1, 2, 3],
          influences: [
            [{ boneId: 'b1', weight: 1 }],
            [{ boneId: 'b1', weight: 0.8 }, { boneId: 'b2', weight: 0.2 }],
            [{ boneId: 'b2', weight: 1 }],
            [{ boneId: 'b1', weight: 0.5 }, { boneId: 'b2', weight: 0.5 }],
          ],
          boneWeights: [1, 0.8, 0, 0.5],
          jointBoneId: 'b2',
        },
        blendShapes: [
          {
            id: 'smile',
            name: 'Smile',
            deltas: [
              { dx: 0, dy: 0 },
              { dx: 5, dy: -2 },
              { dx: 3, dy: -4 },
              { dx: 0, dy: 0 },
            ],
          },
        ],
        blendShapeValues: { smile: 0 },
      },
      {
        id: 'warp1',
        type: 'warpDeformer',
        name: 'Warp',
        parent: 'head',
        opacity: 1,
        visible: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
        col: 3,
        row: 3,
        gridX: 0,
        gridY: 0,
        gridW: 200,
        gridH: 200,
      },
    ],
    bones: [
      {
        id: 'b1',
        name: 'HeadBone',
        parentId: null,
        setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 80 },
        inherit: 'normal',
        nodeId: 'head',
      },
      {
        id: 'b2',
        name: 'JawBone',
        parentId: 'b1',
        setup: { x: 0, y: 80, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 40 },
        inherit: 'normal',
        nodeId: null,
      },
    ],
    slots: [
      {
        id: 's1',
        name: 'FaceSlot',
        boneId: 'b1',
        setupAttachmentId: 'a1',
        color: '#ffffff',
        blendMode: 'normal',
        drawOrder: 0,
      },
    ],
    attachments: [
      {
        id: 'a1',
        type: 'region',
        assetId: 'tex-face',
        localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
      },
      {
        id: 'a2',
        type: 'mesh',
        assetId: 'tex-face',
      },
    ],
    skins: [
      {
        id: 'skin-default',
        name: 'Default',
        entries: [
          { slotId: 's1', attachmentId: 'a1' },
        ],
      },
    ],
    constraints: [
      {
        id: 'c1',
        type: 'ik',
        name: 'JawIK',
        order: 0,
        enabled: true,
        affectedBoneIds: ['b2'],
        assignedBoneId: 'b2',
        targetBoneId: null,
        targetX: 50,
        targetY: 120,
        color: 0xff0000,
        poleBoneId: null,
        mix: 1,
        fkIk: 0,
        bendPositive: true,
      },
    ],
    defaultPose: {
      b1: { x: 0, y: 0, rotation: 0 },
      b2: { x: 0, y: 80, rotation: 0 },
      warp1: { mesh_verts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] },
    },
    animations: [
      {
        id: 'anim-idle',
        name: 'Idle',
        duration: 1000,
        fps: 24,
        tracks: [
          {
            targetId: 'face',
            property: 'mesh_verts',
            keyframes: [
              {
                time: 0,
                value: [
                  { x: 0, y: 0 },
                  { x: 100, y: 0 },
                  { x: 100, y: 100 },
                  { x: 0, y: 100 },
                ],
              },
              {
                time: 500,
                value: [
                  { x: 2, y: -1 },
                  { x: 103, y: 1 },
                  { x: 98, y: 98 },
                  { x: 1, y: 99 },
                ],
                easing: 'ease-both',
              },
            ],
          },
          {
            targetId: 'face',
            property: 'blendShape:smile',
            keyframes: [
              { time: 0, value: 0 },
              { time: 500, value: 0.8 },
              { time: 1000, value: 0 },
            ],
          },
          {
            targetId: 'b1',
            property: 'rotation',
            keyframes: [
              { time: 0, value: 0 },
              { time: 250, value: 5, easing: [0.42, 0, 0.58, 1] },
              { time: 750, value: -5 },
              { time: 1000, value: 0 },
            ],
          },
          {
            targetId: 'face',
            property: 'opacity',
            keyframes: [
              { time: 0, value: 1 },
              { time: 500, value: 0.8 },
            ],
          },
          {
            targetId: 'c1',
            property: 'targetX',
            keyframes: [
              { time: 0, value: 50 },
              { time: 500, value: 55 },
            ],
          },
          {
            targetId: 'face',
            property: 'drawOrder',
            keyframes: [
              { time: 0, value: 0 },
              { time: 500, value: 1 },
            ],
          },
        ],
        markers: [
          { id: 'm1', time: 0, label: 'Start' },
          { id: 'm2', time: 500, label: 'Mid' },
        ],
        audioTracks: [
          {
            id: 'at1',
            name: 'Voice',
            source: 'audios/at1.wav',
            mimeType: 'audio/wav',
            audioDurationMs: 2000,
            audioStartMs: 0,
            audioEndMs: 1000,
            timelineStartMs: 0,
          },
        ],
      },
    ],
    physics_groups: [
      { id: 'pg1', name: 'Hair' },
    ],
    physicsRules: [
      { id: 'pr1', type: 'spring', groupId: 'pg1', stiffness: 0.5 },
    ],
    libraryFolders: [
      { id: 'f1', name: 'Character', parentId: null, sourceFileName: 'char.psd', origin: 'import' },
    ],
    assetPlacements: [
      { assetId: 'face', folderId: 'f1' },
    ],
    modularSprites: [],
    controlHandles: [],
    animationModifiers: [],
  };
}

export function createGoldenPortable() {
  const project = createGoldenProject();
  return JSON.parse(JSON.stringify(project)) as ReturnType<typeof createGoldenProject>;
}
