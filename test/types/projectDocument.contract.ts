import type {
  ProjectDocument,
  Node,
  PartNode,
  GroupNode,
  WarpDeformerNode,
  Mesh,
  Vertex,
  BlendShape,
  Bone,
  Constraint,
  Slot,
  Attachment,
  Skin,
  Texture,
  Animation,
  Track,
  Keyframe,
  Marker,
  AudioTrack,
  Canvas,
  LibraryFolder,
  AssetPlacement,
  BoneSetup,
} from '../../packages/contracts/src/project.js';
import type {
  NodeId,
  BoneId,
  AssetId,
  AnimationId,
  SlotId,
  AttachmentId,
  SkinId,
  ConstraintId,
} from '../../packages/contracts/src/errors.js';

const N = (s: string) => s as NodeId;
const B = (s: string) => s as BoneId;
const A = (s: string) => s as AssetId;
const Anim = (s: string) => s as AnimationId;
const S = (s: string) => s as SlotId;
const Att = (s: string) => s as AttachmentId;
const Sk = (s: string) => s as SkinId;
const C = (s: string) => s as ConstraintId;

const canvas: Canvas = {
  width: 800,
  height: 600,
  x: 0,
  y: 0,
};

const texture: Texture = {
  id: A('tex-face'),
  source: 'textures/tex-face.png',
  fileName: 'face.png',
  fileSize: 12345,
};

const vertices: Vertex[] = [
  { x: 0, y: 0, restX: 0, restY: 0 },
  { x: 100, y: 0, restX: 100, restY: 0 },
  { x: 100, y: 100, restX: 100, restY: 100 },
  { x: 0, y: 100, restX: 0, restY: 100 },
];

const mesh: Mesh = {
  vertices,
  uvs: [0, 0, 1, 0, 1, 1, 0, 1],
  triangles: [[0, 1, 2], [0, 2, 3]],
  edgeIndices: [0, 1, 2, 3],
  boneWeights: [1, 0.8, 0, 0.5],
  jointBoneId: 'b2',
  influences: [
    [{ boneId: B('b1'), weight: 1 }],
    [{ boneId: B('b1'), weight: 0.8 }, { boneId: B('b2'), weight: 0.2 }],
    [{ boneId: B('b2'), weight: 1 }],
    [{ boneId: B('b1'), weight: 0.5 }, { boneId: B('b2'), weight: 0.5 }],
  ],
};

const blendShape: BlendShape = {
  id: 'smile',
  name: 'Smile',
  deltas: [
    { dx: 0, dy: 0 },
    { dx: 5, dy: -2 },
    { dx: 3, dy: -4 },
    { dx: 0, dy: 0 },
  ],
};

const headGroup: GroupNode = {
  id: N('head'),
  type: 'group',
  name: 'Head',
  parent: null,
  opacity: 1,
  visible: true,
  transform: { x: 400, y: 200, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
};

const facePart: PartNode = {
  id: N('face'),
  type: 'part',
  name: 'Face',
  parent: N('head'),
  draw_order: 0,
  opacity: 1,
  visible: true,
  transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 50, pivotY: 50 },
  textureId: 'tex-face',
  imageWidth: 100,
  imageHeight: 100,
  imageBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  alphaContours: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
  mesh,
  blendShapes: [blendShape],
  blendShapeValues: { smile: 0 },
};

const warpNode: WarpDeformerNode = {
  id: N('warp1'),
  type: 'warpDeformer',
  name: 'Warp',
  parent: N('head'),
  opacity: 1,
  visible: true,
  transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
  col: 3,
  row: 3,
  gridX: 0,
  gridY: 0,
  gridW: 200,
  gridH: 200,
};

const nodes: Node[] = [headGroup, facePart, warpNode];

const boneSetup: BoneSetup = {
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 80,
};

const bones: Bone[] = [
  {
    id: B('b1'),
    name: 'HeadBone',
    parentId: null,
    setup: boneSetup,
    inherit: 'normal',
    nodeId: N('head'),
  },
  {
    id: B('b2'),
    name: 'JawBone',
    parentId: B('b1'),
    setup: { x: 0, y: 80, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 40 },
    inherit: 'normal',
    nodeId: null,
  },
];

const constraints: Constraint[] = [
  {
    id: C('c1'),
    type: 'ik',
    name: 'JawIK',
    order: 0,
    enabled: true,
    affectedBoneIds: [B('b2')],
    assignedBoneId: B('b2'),
    targetBoneId: null,
    targetX: 50,
    targetY: 120,
    color: 0xff0000,
    poleBoneId: null,
    mix: 1,
    fkIk: 0,
    bendPositive: true,
  },
];

const slots: Slot[] = [
  {
    id: S('s1'),
    name: 'FaceSlot',
    boneId: B('b1'),
    setupAttachmentId: Att('a1'),
    color: '#ffffff',
    blendMode: 'normal',
    drawOrder: 0,
  },
];

const attachments: Attachment[] = [
  {
    id: Att('a1'),
    type: 'region',
    assetId: 'tex-face',
    localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 },
  },
  {
    id: Att('a2'),
    type: 'mesh',
    assetId: 'tex-face',
  },
];

const skins: Skin[] = [
  {
    id: Sk('skin-default'),
    name: 'Default',
    entries: [{ slotId: S('s1'), attachmentId: Att('a1') }],
  },
];

const defaultPose: Record<string, Record<string, number | boolean | { x: number; y: number }[]>> = {
  b1: { x: 0, y: 0, rotation: 0 },
  b2: { x: 0, y: 80, rotation: 0 },
  warp1: { mesh_verts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] },
};

const meshVertsKf: Keyframe[] = [
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
];

const tracks: Track[] = [
  { targetId: N('face'), property: 'mesh_verts', keyframes: meshVertsKf },
  {
    targetId: N('face'),
    property: 'blendShape:smile',
    keyframes: [
      { time: 0, value: 0 },
      { time: 500, value: 0.8 },
      { time: 1000, value: 0 },
    ],
  },
  {
    targetId: B('b1'),
    property: 'rotation',
    keyframes: [
      { time: 0, value: 0 },
      { time: 250, value: 5, easing: [0.42, 0, 0.58, 1] },
      { time: 750, value: -5 },
      { time: 1000, value: 0 },
    ],
  },
];

const markers: Marker[] = [
  { id: 'm1', time: 0, label: 'Start' },
  { id: 'm2', time: 500, label: 'Mid' },
];

const audioTracks: AudioTrack[] = [
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
];

const animations: Animation[] = [
  {
    id: Anim('anim-idle'),
    name: 'Idle',
    duration: 1000,
    fps: 24,
    tracks,
    markers,
    audioTracks,
  },
];

const physics_groups: unknown[] = [{ id: 'pg1', name: 'Hair' }];
const physicsRules: ProjectDocument['physicsRules'] = [
  { id: 'pr1', type: 'spring', groupId: 'pg1', stiffness: 0.5 },
];

const libraryFolders: LibraryFolder[] = [
  { id: 'f1', name: 'Character', parentId: null, sourceFileName: 'char.psd', origin: 'import' },
];

const assetPlacements: AssetPlacement[] = [
  { assetId: 'face', folderId: 'f1' },
];

const doc: ProjectDocument = {
  version: 6,
  author: 'Contract Author',
  lastActiveAnimationId: Anim('idle'),
  canvas,
  textures: [texture],
  nodes,
  bones,
  slots,
  attachments,
  skins,
  constraints,
  defaultPose,
  animations,
  physics_groups,
  physicsRules,
  libraryFolders,
  assetPlacements,
  modularSprites: [],
  controlHandles: [],
  animationModifiers: [],
};

const _check: ProjectDocument = doc;
void _check;
