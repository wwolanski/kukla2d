import {
  toAnimationId,
  toAnimationTargetId,
  toAssetId,
  toBoneId,
  toNodeId,
  type Animation,
  type Bone,
  type Keyframe,
  type PartNode,
  type ProjectDocument,
  type Track,
} from "@kukla2d/contracts";

import { createEmptyProject } from "@/core/createEmptyProject";

import type {
  ScmlAnimation,
  ScmlDocument,
  ScmlEntity,
  ScmlFileAsset,
  ScmlMainlineKey,
  ScmlRef,
  ScmlTimeline,
  ScmlTransform,
} from "./scmlModel.types.js";

interface ConvertScmlOptions {
  sources: ReadonlyMap<string, { url: string; size: number }>;
  sourceFileName: string;
}

type WorldTransform = ScmlTransform;

interface EvaluatedObject {
  nodeKey: string;
  slotKey: string;
  fileKey: string;
  name: string;
  parentBoneKey: string | null;
  localTransform: ScmlTransform;
  transform: WorldTransform;
  zIndex: number;
}

interface EvaluatedBone {
  boneKey: string;
  parentKey: string | null;
  name: string;
  transform: WorldTransform;
}

interface EvaluatedFrame {
  time: number;
  objects: EvaluatedObject[];
  bones: EvaluatedBone[];
}

interface EvaluatedClip {
  entity: ScmlEntity;
  animation: ScmlAnimation;
  fps: number;
  frames: EvaluatedFrame[];
}

interface NativeObjectPose {
  pivotWorldX: number;
  pivotWorldY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  drawOrder: number;
}

interface NativeNodeDefinition {
  key: string;
  slotKey: string;
  file: ScmlFileAsset;
  name: string;
  pivotX: number;
  pivotY: number;
  ownerBoneKey: string | null;
  rigidLink: boolean;
  setupObject: EvaluatedObject;
  setupActive: boolean;
}

const PADDING = 20;

function fileKey(
  folderId: number | undefined,
  fileId: number | undefined,
): string {
  if (folderId === undefined || fileId === undefined)
    throw new Error("Invalid SCML: sprite key has no folder/file reference");
  return `${folderId}:${fileId}`;
}

function nodeKey(
  entity: ScmlEntity,
  timeline: ScmlTimeline,
  assetKey: string,
): string {
  return `${entity.id}|${timeline.name}|${assetKey}`;
}

function slotKey(entity: ScmlEntity, timeline: ScmlTimeline): string {
  return `${entity.id}|${timeline.name}`;
}

function boneKey(entity: ScmlEntity, timeline: ScmlTimeline): string {
  return `${entity.id}|${timeline.objectId ?? timeline.name}`;
}

function nativeNodeId(key: string) {
  return toNodeId(`scml-node:${encodeURIComponent(key)}`);
}

function nativeBoneId(key: string) {
  return toBoneId(`scml-bone:${encodeURIComponent(key)}`);
}

function nativeAssetId(key: string) {
  return toAssetId(`scml-asset:${key}`);
}

function currentMainlineKey(
  animation: ScmlAnimation,
  time: number,
): ScmlMainlineKey {
  const normalizedTime =
    animation.looping && animation.length > 0 ? time % animation.length : time;
  let current = animation.mainlineKeys[0]!;
  for (const key of animation.mainlineKeys) {
    if (key.time > normalizedTime) break;
    current = key;
  }
  return current;
}

function interpolateAngle(
  a: number,
  b: number,
  factor: number,
  spin: number,
): number {
  if (spin === 0) return a;
  let delta = b - a;
  if (spin > 0 && delta < 0) delta += 360;
  if (spin < 0 && delta > 0) delta -= 360;
  return a + delta * factor;
}

function interpolateTransform(
  a: ScmlTransform,
  b: ScmlTransform,
  factor: number,
  spin: number,
): ScmlTransform {
  const lerp = (start: number, end: number) => start + (end - start) * factor;
  return {
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    angle: interpolateAngle(a.angle, b.angle, factor, spin),
    scaleX: lerp(a.scaleX, b.scaleX),
    scaleY: lerp(a.scaleY, b.scaleY),
    alpha: lerp(a.alpha, b.alpha),
    ...(a.pivotX === undefined ? {} : { pivotX: a.pivotX }),
    ...(a.pivotY === undefined ? {} : { pivotY: a.pivotY }),
    ...(a.folderId === undefined ? {} : { folderId: a.folderId }),
    ...(a.fileId === undefined ? {} : { fileId: a.fileId }),
  };
}

function evaluateTimeline(
  animation: ScmlAnimation,
  timeline: ScmlTimeline,
  ref: ScmlRef,
  time: number,
): ScmlTransform {
  const keyIndex = timeline.keys.findIndex((key) => key.id === ref.keyId);
  if (keyIndex < 0)
    throw new Error(
      `Invalid SCML: timeline ${timeline.id} lacks key ${ref.keyId}`,
    );
  const current = timeline.keys[keyIndex]!;
  const next =
    timeline.keys[keyIndex + 1] ??
    (animation.looping ? timeline.keys[0] : undefined);
  if (!next || current.curveType === "instant" || animation.length <= 0)
    return current.transform;
  if (current.curveType !== "linear") {
    throw new Error(
      `Unsupported SCML curve_type "${current.curveType}" in animation "${animation.name}"`,
    );
  }

  let sampleTime = time;
  let nextTime = next.time;
  if (nextTime <= current.time) nextTime += animation.length;
  if (sampleTime < current.time) sampleTime += animation.length;
  const duration = nextTime - current.time;
  const factor =
    duration <= 0
      ? 0
      : Math.max(0, Math.min(1, (sampleTime - current.time) / duration));
  return interpolateTransform(
    current.transform,
    next.transform,
    factor,
    current.spin,
  );
}

function compose(
  parent: WorldTransform | null,
  local: ScmlTransform,
): WorldTransform {
  if (!parent) return { ...local };
  const scaledX = local.x * parent.scaleX;
  const scaledY = local.y * parent.scaleY;
  const radians = (parent.angle * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const reflected = parent.scaleX * parent.scaleY < 0 ? -1 : 1;
  return {
    ...local,
    x: parent.x + scaledX * cosine - scaledY * sine,
    y: parent.y + scaledX * sine + scaledY * cosine,
    angle: parent.angle + local.angle * reflected,
    scaleX: parent.scaleX * local.scaleX,
    scaleY: parent.scaleY * local.scaleY,
    alpha: parent.alpha * local.alpha,
  };
}

function evaluateFrame(
  entity: ScmlEntity,
  animation: ScmlAnimation,
  time: number,
): EvaluatedFrame {
  const mainline = currentMainlineKey(animation, time);
  const timelines = new Map(
    animation.timelines.map((timeline) => [timeline.id, timeline]),
  );
  const boneRefs = new Map(mainline.boneRefs.map((ref) => [ref.id, ref]));
  const resolvedBones = new Map<number, EvaluatedBone>();
  const resolving = new Set<number>();

  const resolveBone = (ref: ScmlRef): EvaluatedBone => {
    const cached = resolvedBones.get(ref.id);
    if (cached) return cached;
    if (resolving.has(ref.id))
      throw new Error(
        `Invalid SCML: bone parent cycle in animation "${animation.name}"`,
      );
    resolving.add(ref.id);
    const timeline = timelines.get(ref.timelineId);
    if (!timeline || timeline.objectType !== "bone")
      throw new Error(`Invalid SCML: missing bone timeline ${ref.timelineId}`);
    const parent = ref.parentId === null ? null : boneRefs.get(ref.parentId);
    if (ref.parentId !== null && !parent)
      throw new Error(`Invalid SCML: missing parent bone_ref ${ref.parentId}`);
    const parentBone = parent ? resolveBone(parent) : null;
    const evaluated: EvaluatedBone = {
      boneKey: boneKey(entity, timeline),
      parentKey: parentBone?.boneKey ?? null,
      name: timeline.name,
      transform: compose(
        parentBone?.transform ?? null,
        evaluateTimeline(animation, timeline, ref, time),
      ),
    };
    resolving.delete(ref.id);
    resolvedBones.set(ref.id, evaluated);
    return evaluated;
  };

  for (const ref of mainline.boneRefs) resolveBone(ref);
  const objects = mainline.objectRefs.map((ref) => {
    const timeline = timelines.get(ref.timelineId);
    if (!timeline || timeline.objectType !== "sprite")
      throw new Error(
        `Invalid SCML: missing sprite timeline ${ref.timelineId}`,
      );
    const local = evaluateTimeline(animation, timeline, ref, time);
    const assetKey = fileKey(local.folderId, local.fileId);
    const parent =
      ref.parentId === null ? null : resolvedBones.get(ref.parentId);
    if (ref.parentId !== null && !parent)
      throw new Error(
        `Invalid SCML: missing object parent bone_ref ${ref.parentId}`,
      );
    return {
      nodeKey: nodeKey(entity, timeline, assetKey),
      slotKey: slotKey(entity, timeline),
      fileKey: assetKey,
      name: timeline.name,
      parentBoneKey: parent?.boneKey ?? null,
      localTransform: local,
      transform: compose(parent?.transform ?? null, local),
      zIndex: ref.zIndex,
    };
  });
  return { time, objects, bones: [...resolvedBones.values()] };
}

function sampleTimes(animation: ScmlAnimation, fps: number): number[] {
  if (animation.length <= 0) return [0];
  const times: number[] = [];
  const frameDuration = 1000 / fps;
  for (let frame = 0; frame * frameDuration < animation.length; frame++) {
    times.push(frame * frameDuration);
  }
  if (times.at(-1) !== animation.length) times.push(animation.length);
  return times;
}

function evaluateClips(document: ScmlDocument): EvaluatedClip[] {
  return document.entities.flatMap((entity) =>
    entity.animations.map((animation) => {
      const fps = Math.max(
        1,
        Math.min(120, Math.round(1000 / animation.interval)),
      );
      return {
        entity,
        animation,
        fps,
        frames: sampleTimes(animation, fps).map((time) =>
          evaluateFrame(entity, animation, time),
        ),
      };
    }),
  );
}

function fileMap(document: ScmlDocument): Map<string, ScmlFileAsset> {
  return new Map(document.files.map((file) => [file.key, file]));
}

function objectPose(object: EvaluatedObject): NativeObjectPose {
  return {
    pivotWorldX: object.transform.x,
    pivotWorldY: -object.transform.y,
    rotation: -object.transform.angle,
    scaleX: object.transform.scaleX,
    scaleY: object.transform.scaleY,
    opacity: object.transform.alpha,
    drawOrder: object.zIndex,
  };
}

function transformedBounds(
  pose: NativeObjectPose,
  file: ScmlFileAsset,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const pivotX = file.pivotX * file.width;
  const pivotY = (1 - file.pivotY) * file.height;
  const radians = (pose.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [-pivotX, -pivotY],
    [file.width - pivotX, -pivotY],
    [file.width - pivotX, file.height - pivotY],
    [-pivotX, file.height - pivotY],
  ] as const;
  const points = corners.map(([x, y]) => {
    const sx = x * pose.scaleX;
    const sy = y * pose.scaleY;
    return {
      x: pose.pivotWorldX + sx * cosine - sy * sine,
      y: pose.pivotWorldY + sx * sine + sy * cosine,
    };
  });
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function computeCanvas(
  clips: readonly EvaluatedClip[],
  files: ReadonlyMap<string, ScmlFileAsset>,
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const clip of clips)
    for (const frame of clip.frames)
      for (const object of frame.objects) {
        if (object.transform.alpha <= 0) continue;
        const file = files.get(object.fileKey);
        if (!file)
          throw new Error(
            `Invalid SCML: missing declared file ${object.fileKey}`,
          );
        const bounds = transformedBounds(objectPose(object), file);
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
      }
  if (!Number.isFinite(minX))
    return { width: 800, height: 600, shiftX: 400, shiftY: 300 };
  return {
    width: Math.max(1, Math.ceil(maxX - minX + PADDING * 2)),
    height: Math.max(1, Math.ceil(maxY - minY + PADDING * 2)),
    shiftX: PADDING - minX,
    shiftY: PADDING - minY,
  };
}

function dedupeKeyframes(keyframes: Keyframe[]): Keyframe[] {
  const byTime = new Map<number, Keyframe>();
  for (const keyframe of keyframes) byTime.set(keyframe.time, keyframe);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function makeTrack(
  targetId: string,
  property: string,
  frames: Array<{ time: number; value: number }>,
  easing = "linear",
): Track {
  return {
    targetId: toAnimationTargetId(targetId),
    property,
    keyframes: dedupeKeyframes(
      frames.map((frame) => ({ time: frame.time, value: frame.value, easing })),
    ),
  };
}

function buildAnimation(
  clip: EvaluatedClip,
  nodeDefinitions: ReadonlyMap<string, NativeNodeDefinition>,
  setupBones: ReadonlyMap<string, EvaluatedBone>,
  canvas: ReturnType<typeof computeCanvas>,
  multipleEntities: boolean,
): Animation {
  const tracks: Track[] = [];
  for (const [key, definition] of nodeDefinitions) {
    const values = clip.frames.map((frame) => {
      const exactObject =
        frame.objects.find((candidate) => candidate.nodeKey === key) ?? null;
      const slotObject =
        exactObject ??
        frame.objects.find(
          (candidate) => candidate.slotKey === definition.slotKey,
        ) ??
        null;
      if (!slotObject) return { time: frame.time, pose: null, active: false };

      // A native rigid link applies posedBone * inverse(bindBone) to this
      // source transform. Store the SCML sprite under its bind bone so the
      // linked result equals posedBone * animatedLocalSprite.
      const bindBone = definition.ownerBoneKey
        ? setupBones.get(definition.ownerBoneKey)
        : null;
      const canUseRigidLink =
        definition.rigidLink &&
        bindBone &&
        slotObject.parentBoneKey === definition.ownerBoneKey;
      const sourceTransform = canUseRigidLink
        ? compose(bindBone.transform, slotObject.localTransform)
        : slotObject.transform;
      return {
        time: frame.time,
        pose: objectPose({ ...slotObject, transform: sourceTransform }),
        active: exactObject !== null,
      };
    });
    const id = nativeNodeId(key);
    tracks.push(
      makeTrack(
        id,
        "x",
        values.map((value) => ({
          time: value.time,
          value:
            (value.pose?.pivotWorldX ?? 0) + canvas.shiftX - definition.pivotX,
        })),
      ),
      makeTrack(
        id,
        "y",
        values.map((value) => ({
          time: value.time,
          value:
            (value.pose?.pivotWorldY ?? 0) + canvas.shiftY - definition.pivotY,
        })),
      ),
      makeTrack(
        id,
        "rotation",
        values.map((value) => ({
          time: value.time,
          value: value.pose?.rotation ?? 0,
        })),
      ),
      makeTrack(
        id,
        "scaleX",
        values.map((value) => ({
          time: value.time,
          value: value.pose?.scaleX ?? 1,
        })),
      ),
      makeTrack(
        id,
        "scaleY",
        values.map((value) => ({
          time: value.time,
          value: value.pose?.scaleY ?? 1,
        })),
      ),
      makeTrack(
        id,
        "opacity",
        values.map((value) => ({
          time: value.time,
          value: value.active ? (value.pose?.opacity ?? 0) : 0,
        })),
        "stepped",
      ),
      makeTrack(
        id,
        "drawOrder",
        values.map((value) => ({
          time: value.time,
          value: value.pose?.drawOrder ?? 0,
        })),
        "stepped",
      ),
    );
  }

  const boneKeys = new Set(
    clip.frames.flatMap((frame) => frame.bones.map((bone) => bone.boneKey)),
  );
  for (const key of boneKeys) {
    const values = clip.frames.map((frame) => ({
      time: frame.time,
      bone: frame.bones.find((candidate) => candidate.boneKey === key) ?? null,
    }));
    const id = nativeBoneId(key);
    tracks.push(
      makeTrack(
        id,
        "x",
        values.map((value) => ({
          time: value.time,
          value: (value.bone?.transform.x ?? 0) + canvas.shiftX,
        })),
      ),
      makeTrack(
        id,
        "y",
        values.map((value) => ({
          time: value.time,
          value: -(value.bone?.transform.y ?? 0) + canvas.shiftY,
        })),
      ),
      makeTrack(
        id,
        "rotation",
        values.map((value) => ({
          time: value.time,
          value: -(value.bone?.transform.angle ?? 0),
        })),
      ),
      makeTrack(
        id,
        "scaleX",
        values.map((value) => ({
          time: value.time,
          value: value.bone?.transform.scaleX ?? 1,
        })),
      ),
      makeTrack(
        id,
        "scaleY",
        values.map((value) => ({
          time: value.time,
          value: value.bone?.transform.scaleY ?? 1,
        })),
      ),
    );
  }
  const name = multipleEntities
    ? `${clip.entity.name} / ${clip.animation.name}`
    : clip.animation.name;
  return {
    id: toAnimationId(`scml-animation:${clip.entity.id}:${clip.animation.id}`),
    name,
    duration: clip.animation.length,
    fps: clip.fps,
    tracks,
  };
}

function setupFrameByEntity(
  clips: readonly EvaluatedClip[],
): Map<number, EvaluatedFrame> {
  const result = new Map<number, EvaluatedFrame>();
  const entityIds = new Set(clips.map((clip) => clip.entity.id));
  for (const entityId of entityIds) {
    const entityClips = clips.filter((clip) => clip.entity.id === entityId);
    const preferred =
      entityClips.find(
        (clip) => clip.animation.name.toLowerCase() === "base",
      ) ?? entityClips[0];
    const frame = preferred?.frames[0];
    if (frame) result.set(entityId, frame);
  }
  return result;
}

function entityIdFromObjectKey(key: string): number {
  return Number(key.split("|", 1)[0]);
}

function fileStem(name: string): string {
  const basename = name.replace(/\\/g, "/").split("/").at(-1) ?? name;
  return basename.replace(/\.[^.]+$/, "");
}

function collectSetupBones(
  clips: readonly EvaluatedClip[],
  setupFrames: ReadonlyMap<number, EvaluatedFrame>,
): Map<string, EvaluatedBone> {
  const setupByKey = new Map<string, EvaluatedBone>();
  for (const frame of setupFrames.values())
    for (const bone of frame.bones) {
      setupByKey.set(bone.boneKey, bone);
    }
  for (const clip of clips)
    for (const frame of clip.frames)
      for (const bone of frame.bones) {
        if (!setupByKey.has(bone.boneKey)) setupByKey.set(bone.boneKey, bone);
      }
  return setupByKey;
}

function buildBones(
  setupBones: ReadonlyMap<string, EvaluatedBone>,
  entities: readonly ScmlEntity[],
  canvas: ReturnType<typeof computeCanvas>,
): Bone[] {
  const infoByKey = new Map<string, { width: number }>();
  for (const entity of entities)
    for (const info of entity.objectInfos) {
      infoByKey.set(`${entity.id}|${info.id}`, { width: info.width });
    }
  return [...setupBones.values()].map((bone) => ({
    id: nativeBoneId(bone.boneKey),
    name: bone.name,
    parentId: bone.parentKey ? nativeBoneId(bone.parentKey) : null,
    setup: {
      x: bone.transform.x + canvas.shiftX,
      y: -bone.transform.y + canvas.shiftY,
      rotation: -bone.transform.angle,
      scaleX: bone.transform.scaleX,
      scaleY: bone.transform.scaleY,
      shearX: 0,
      shearY: 0,
      length: infoByKey.get(bone.boneKey)?.width ?? 40,
    },
  }));
}

export function convertScmlToProject(
  document: ScmlDocument,
  options: ConvertScmlOptions,
): ProjectDocument {
  const project = createEmptyProject();
  const files = fileMap(document);
  const clips = evaluateClips(document);
  const canvas = computeCanvas(clips, files);
  const setupFrames = setupFrameByEntity(clips);
  const setupBones = collectSetupBones(clips, setupFrames);
  project.canvas = {
    width: canvas.width,
    height: canvas.height,
    x: 0,
    y: 0,
    presetId: "custom",
    fitSource: null,
  };

  const folderId = `scml-folder:${encodeURIComponent(options.sourceFileName)}`;
  project.libraryFolders.push({
    id: folderId,
    name: options.sourceFileName.replace(/\.scml$/i, ""),
    parentId: null,
    sourceFileName: options.sourceFileName,
    origin: "import",
  });
  for (const file of document.files) {
    const source = options.sources.get(file.key);
    if (!source) throw new Error(`Missing SCML image: ${file.name}`);
    const id = nativeAssetId(file.key);
    project.textures.push({
      id,
      source: source.url,
      fileName: file.name,
      fileSize: source.size,
    });
    project.assetPlacements.push({ assetId: id, folderId });
  }

  const allObjects = new Map<string, EvaluatedObject>();
  const objectOccurrences = new Map<string, EvaluatedObject[]>();
  for (const clip of clips)
    for (const frame of clip.frames)
      for (const object of frame.objects) {
        if (!allObjects.has(object.nodeKey))
          allObjects.set(object.nodeKey, object);
        const occurrences = objectOccurrences.get(object.nodeKey) ?? [];
        occurrences.push(object);
        objectOccurrences.set(object.nodeKey, occurrences);
      }
  const nodeDefinitions = new Map<string, NativeNodeDefinition>();
  for (const object of allObjects.values()) {
    const file = files.get(object.fileKey);
    if (!file)
      throw new Error(`Invalid SCML: missing declared file ${object.fileKey}`);
    const setupFrame = setupFrames.get(entityIdFromObjectKey(object.nodeKey));
    const exactSetupObject =
      setupFrame?.objects.find(
        (candidate) => candidate.nodeKey === object.nodeKey,
      ) ?? null;
    const slotSetupObject =
      exactSetupObject ??
      setupFrame?.objects.find(
        (candidate) => candidate.slotKey === object.slotKey,
      ) ??
      null;
    const setupObject = slotSetupObject ?? object;
    const pivotX = (object.localTransform.pivotX ?? file.pivotX) * file.width;
    const pivotY =
      (1 - (object.localTransform.pivotY ?? file.pivotY)) * file.height;
    const ownerBoneKey = setupObject.parentBoneKey ?? object.parentBoneKey;
    const parentKeys = new Set(
      (objectOccurrences.get(object.nodeKey) ?? []).map(
        (candidate) => candidate.parentBoneKey,
      ),
    );
    const rigidLink =
      ownerBoneKey !== null &&
      parentKeys.size === 1 &&
      parentKeys.has(ownerBoneKey);
    const setupPose = objectPose(setupObject);
    const definition: NativeNodeDefinition = {
      key: object.nodeKey,
      slotKey: object.slotKey,
      file,
      name: fileStem(file.name),
      pivotX,
      pivotY,
      ownerBoneKey,
      rigidLink,
      setupObject,
      setupActive: exactSetupObject !== null,
    };
    nodeDefinitions.set(object.nodeKey, definition);
    const node: PartNode = {
      id: nativeNodeId(object.nodeKey),
      type: "part",
      name: definition.name,
      parent: null,
      draw_order: setupObject.zIndex,
      opacity: definition.setupActive ? setupPose.opacity : 0,
      visible: true,
      clip_mask: null,
      transform: {
        x: setupPose.pivotWorldX + canvas.shiftX - pivotX,
        y: setupPose.pivotWorldY + canvas.shiftY - pivotY,
        rotation: setupPose.rotation,
        scaleX: setupPose.scaleX,
        scaleY: setupPose.scaleY,
        pivotX,
        pivotY,
      },
      meshOpts: null,
      mesh: null,
      ...(ownerBoneKey ? { boneId: nativeBoneId(ownerBoneKey) } : {}),
      ...(rigidLink ? {} : { boneLinkLocked: false }),
      imageWidth: file.width,
      imageHeight: file.height,
      imageBounds: { minX: 0, minY: 0, maxX: file.width, maxY: file.height },
      textureId: nativeAssetId(file.key),
    };
    project.nodes.push(node);
  }

  project.bones = buildBones(setupBones, document.entities, canvas);
  project.animations = clips.map((clip) =>
    buildAnimation(
      clip,
      nodeDefinitions,
      setupBones,
      canvas,
      document.entities.length > 1,
    ),
  );
  return project;
}
