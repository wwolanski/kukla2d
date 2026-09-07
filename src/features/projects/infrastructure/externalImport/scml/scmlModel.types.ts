export interface ScmlFileAsset {
  key: string;
  folderId: number;
  fileId: number;
  name: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
}

export interface ScmlTransform {
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  pivotX?: number;
  pivotY?: number;
  folderId?: number;
  fileId?: number;
}

interface ScmlTimelineKey {
  id: number;
  time: number;
  spin: number;
  curveType: string;
  transform: ScmlTransform;
}

export interface ScmlTimeline {
  id: number;
  objectId: number | null;
  name: string;
  objectType: "bone" | "sprite";
  keys: ScmlTimelineKey[];
}

export interface ScmlRef {
  id: number;
  parentId: number | null;
  timelineId: number;
  keyId: number;
  zIndex: number;
}

export interface ScmlMainlineKey {
  id: number;
  time: number;
  boneRefs: ScmlRef[];
  objectRefs: ScmlRef[];
}

export interface ScmlAnimation {
  id: number;
  name: string;
  length: number;
  interval: number;
  looping: boolean;
  mainlineKeys: ScmlMainlineKey[];
  timelines: ScmlTimeline[];
}

interface ScmlObjectInfo {
  id: number;
  name: string;
  type: string;
  width: number;
  height: number;
}

export interface ScmlEntity {
  id: number;
  name: string;
  objectInfos: ScmlObjectInfo[];
  animations: ScmlAnimation[];
}

export interface ScmlDocument {
  generator: string;
  files: ScmlFileAsset[];
  entities: ScmlEntity[];
}
