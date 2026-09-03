import type {
  ProjectDocument,
  LoadedProjectBundle,
  AudioTrack,
  ProjectArchiveManifest,
} from '@kukla2d/contracts';

import { loadZipAdapter } from '@/platform/lazy/loadZipAdapter';
import { createProjectResourceOwner } from '@/platform/projectResourceOwner';

import {
  PROJECT_ARCHIVE_FORMAT_ID,
  PROJECT_ARCHIVE_VERSION,
  PROJECT_JSON_PATH,
  PROJECT_MANIFEST_PATH,
} from '@/io/projectFormat';
import { migrateProject } from '@/schema/migrateProject';
import { prepareLoadedProjectDocument } from '@/schema/projectDocumentAdapter';
import { validateProject, type ValidatedProjectDocument } from '@/schema/projectSchema';
import { createPortableProjectSnapshot } from '@/schema/projectSnapshot';

import { isRecord } from '@/lib/guards';


const MAX_ENTRIES = 10000;
const MAX_TOTAL_SIZE = 500 * 1024 * 1024;

const FORBIDDEN_PATHS = /\.\.|^\/|^\\/;
const ALLOWED_PATH_PREFIXES = ['textures/', 'audios/'];
const DEFAULT_AUDIO_EXTENSION = 'wav';
const MIME_EXTENSION_OVERRIDES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
};

interface ZipEntryData {
  uncompressedSize: number;
}

function isZipEntryData(value: unknown): value is ZipEntryData {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return 'uncompressedSize' in rec
    && typeof rec.uncompressedSize === 'number'
    && Number.isFinite(rec.uncompressedSize)
    && rec.uncompressedSize >= 0;
}

interface ZipEntry {
  name: string;
  dir: boolean;
  async(type: 'string'): Promise<string>;
  async(type: 'blob'): Promise<Blob>;
}

interface ZipReader {
  file(path: string): ZipEntry | null;
  files: Record<string, ZipEntry>;
}

interface ZipWriter {
  file(name: string, data: unknown): void;
  folder(name: string): { file(name: string, data: unknown): void };
  generateAsync(options: { type: 'blob' }): Promise<Blob>;
}

interface SerializedAudioTrack extends AudioTrack {
  _sourceBlob?: string;
}

function isProjectArchiveManifest(value: unknown): value is ProjectArchiveManifest {
  if (!isRecord(value)) return false;
  const documentVersion = value.documentVersion;
  return typeof value.formatId === 'string'
    && typeof value.formatVersion === 'number'
    && Number.isFinite(value.formatVersion)
    && (typeof documentVersion === 'string'
      || (typeof documentVersion === 'number' && Number.isFinite(documentVersion)));
}

function isAllowedArchiveEntry(name: string): boolean {
  return name === PROJECT_JSON_PATH
    || name === PROJECT_MANIFEST_PATH
    || ALLOWED_PATH_PREFIXES.some(prefix => name.startsWith(prefix));
}

export class AssetResolveError extends Error {
  override name: string = 'AssetResolveError';
  readonly assetId: string;
  readonly assetType: 'texture' | 'audio';
  override readonly cause: unknown;

  constructor(assetId: string, assetType: 'texture' | 'audio', cause: unknown) {
    const message = `Failed to resolve ${assetType} asset "${assetId}": ${isRecord(cause) && typeof cause.message === 'string' ? cause.message : String(cause)}`;
    super(message);
    this.name = 'AssetResolveError';
    this.assetId = assetId;
    this.assetType = assetType;
    this.cause = cause;
  }
}

function archiveSafeId(id: string | null | undefined, fallback: string | null | undefined): string {
  const raw = String(id ?? fallback ?? '').trim();
  return encodeURIComponent(raw || String(fallback)).replace(/\./g, '%2E');
}

function archivePath(folder: string, id: string | null | undefined, extension: string, fallback: string | null | undefined): string {
  return `${folder}/${archiveSafeId(id, fallback)}.${extension}`;
}

function audioExtension(mimeType: string | null | undefined): string {
  if (!mimeType) return DEFAULT_AUDIO_EXTENSION;
  const normalized = String(mimeType).split(';')[0]!.trim().toLowerCase();
  const mapped = MIME_EXTENSION_OVERRIDES[normalized];
  if (mapped) return mapped;
  const subtype = normalized.split('/')[1] ?? DEFAULT_AUDIO_EXTENSION;
  return subtype.replace(/[^a-z0-9]+/gi, '').toLowerCase() || DEFAULT_AUDIO_EXTENSION;
}

async function fetchBlobOrThrow(url: string, assetId: string, assetType: 'texture' | 'audio'): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err: unknown) {
    throw new AssetResolveError(assetId, assetType, err);
  }
  if (!response.ok) {
    throw new AssetResolveError(assetId, assetType, new Error(`HTTP ${response.status}`));
  }
  return response.blob();
}

function zipFileOrThrow(zip: ZipReader, path: string, assetId: string, assetType: 'texture' | 'audio'): ZipEntry {
  const entry = zip.file(path);
  if (!entry) {
    throw new AssetResolveError(assetId, assetType, new Error(`missing archive entry "${path}"`));
  }
  return entry;
}

export async function saveProject(project: ProjectDocument): Promise<Blob> {
  const snapshot = createPortableProjectSnapshot(project);
  const portable = validate(snapshot);

  const errors: AssetResolveError[] = [];

  for (const tex of project.textures ?? []) {
    if (!tex.source) {
      errors.push(new AssetResolveError(tex.id, 'texture', new Error('missing source')));
    }
  }

  for (const animation of project.animations ?? []) {
    for (const track of animation.audioTracks ?? []) {
      if (track.source && !track.sourceUrl) {
        errors.push(new AssetResolveError(track.id, 'audio', new Error('missing runtime source')));
      }
    }
  }

  if (errors.length > 0) {
    const err = new Error(`Cannot save: ${errors.length} asset error(s)`) as Error & { errors: AssetResolveError[] };
    err.name = 'AssetResolveError';
    err.errors = errors;
    throw err;
  }

  const JSZipCtor = await loadZipAdapter();
  const zip = new (JSZipCtor as new () => ZipWriter)();
  const texturesFolder = zip.folder('textures');
  const audiosFolder = zip.folder('audios');

  const serializedTextures: Array<{
    id: string;
    source: string;
    name: string | undefined;
    fileName: string | undefined;
    fileSize: number | null | undefined;
  }> = [];
  for (let i = 0; i < portable.textures.length; i++) {
    const tex = portable.textures[i]!;
    const runtimeTex = project.textures?.[i] ?? tex;
    const blob = await fetchBlobOrThrow(runtimeTex.source, tex.id, 'texture');
    const source = archivePath('textures', tex.id, 'png', `texture-${i}`);
    texturesFolder.file(source.slice('textures/'.length), blob);
    serializedTextures.push({
      id: tex.id,
      source,
      name: tex.name,
      fileName: tex.fileName,
      fileSize: tex.fileSize ?? blob.size,
    });
  }

  const serializedAnimations = portable.animations.map((animation, i) => {
    const runtimeAnim = (project.animations ?? [])[i];
    return {
      ...animation,
      audioTracks: (animation.audioTracks ?? []).map((track, ti) => {
        const t = { ...track } as SerializedAudioTrack;
        const runtimeTrack = runtimeAnim?.audioTracks?.[ti];
        if (runtimeTrack?.sourceUrl) {
          t._sourceBlob = runtimeTrack.sourceUrl;
          t.source = archivePath('audios', track.id, audioExtension(track.mimeType), `audio-${i}-${ti}`);
        }
        return t;
      }),
    };
  });

  for (const animation of serializedAnimations) {
    for (const track of animation.audioTracks ?? []) {
      if (track._sourceBlob) {
        const blob = await fetchBlobOrThrow(track._sourceBlob, track.id, 'audio');
        audiosFolder.file(track.source!.slice('audios/'.length), blob);
        delete track._sourceBlob;
      }
    }
  }

  const projectJson = {
    version: portable.version,
    author: portable.author,
    lastActiveAnimationId: portable.lastActiveAnimationId,
    canvas: portable.canvas,
    textures: serializedTextures,
    nodes: portable.nodes,
    bones: portable.bones,
    slots: portable.slots,
    attachments: portable.attachments,
    skins: portable.skins,
    constraints: portable.constraints,
    defaultPose: portable.defaultPose,
    animations: serializedAnimations,
    physics_groups: portable.physics_groups,
    physicsRules: portable.physicsRules,
    libraryFolders: portable.libraryFolders,
    assetPlacements: portable.assetPlacements,
    modularSprites: portable.modularSprites,
    controlHandles: portable.controlHandles,
    animationModifiers: portable.animationModifiers,
  };

  const manifest = {
    formatId: PROJECT_ARCHIVE_FORMAT_ID,
    formatVersion: PROJECT_ARCHIVE_VERSION,
    documentVersion: portable.version,
  };

  zip.file(PROJECT_JSON_PATH, JSON.stringify(projectJson, null, 2));
  zip.file(PROJECT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

function makeErrorWithCause(message: string, cause: unknown): Error {
  return new Error(message, { cause: cause instanceof Error ? cause : undefined });
}

async function inspectZip(file: Blob | ArrayBuffer | Uint8Array): Promise<ZipReader> {
  const JSZipCtor = await loadZipAdapter();
  let zip: ZipReader;
  try {
    zip = await (new (JSZipCtor as new () => { loadAsync(data: unknown): Promise<ZipReader> })().loadAsync(file));
  } catch (cause: unknown) {
    throw new Error(`Invalid .kk2d project file: cannot read ZIP (${isRecord(cause) && typeof cause.message === 'string' ? cause.message : String(cause)})`, { cause: cause instanceof Error ? cause : undefined });
  }

  const projectFile = zip.file(PROJECT_JSON_PATH);
  if (!projectFile) {
    throw new Error('Invalid .kk2d project file: missing project.json');
  }

  const manifestFile = zip.file(PROJECT_MANIFEST_PATH);
  if (manifestFile) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(await manifestFile.async('string'));
    } catch (cause: unknown) {
      throw makeErrorWithCause(`Invalid .kk2d project file: invalid manifest (${isRecord(cause) && typeof cause.message === 'string' ? cause.message : String(cause)})`, cause);
    }

    if (!isProjectArchiveManifest(manifest)) {
      throw new Error('Invalid .kk2d project file: invalid manifest shape');
    }
    if (manifest.formatId !== PROJECT_ARCHIVE_FORMAT_ID) {
      throw new Error(`Invalid .kk2d project file: unexpected formatId "${String(manifest.formatId)}"`);
    }
  }

  const entries = Object.keys(zip.files).filter(name => !zip.files[name]!.dir);
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`ZIP contains ${entries.length} entries, max allowed is ${MAX_ENTRIES}`);
  }

  let totalSize = 0;
  for (const name of entries) {
    if (FORBIDDEN_PATHS.test(name)) {
      throw new Error(`Invalid path in ZIP: ${name}`);
    }
    if (!isAllowedArchiveEntry(name)) {
      throw new Error(`Unexpected file in ZIP: ${name}`);
    }
    const entryData: unknown = (zip.files[name] as { _data?: unknown })._data;
    totalSize += isZipEntryData(entryData) ? entryData.uncompressedSize : 0;
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new Error(`ZIP total size ${totalSize} exceeds limit ${MAX_TOTAL_SIZE}`);
  }

  return zip;
}

async function readProjectJson(zip: ZipReader): Promise<unknown> {
  const entry = zip.file(PROJECT_JSON_PATH)!;
  const projectJsonStr = await entry.async('string');
  try {
    return JSON.parse(projectJsonStr);
  } catch (cause: unknown) {
    throw makeErrorWithCause(`Invalid .kk2d project file: invalid project.json (${isRecord(cause) && typeof cause.message === 'string' ? cause.message : String(cause)})`, cause);
  }
}

function migrate(rawProject: unknown) {
  return migrateProject(rawProject);
}

function validate(project: unknown): ValidatedProjectDocument {
  const result = validateProject(project);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Project validation failed: ${issues}`);
  }
  return result.data;
}

async function materializeBlobUrls(
  zip: ZipReader,
  project: ProjectDocument,
  resources: { track(url: string): void },
): Promise<{ images: Map<string, HTMLImageElement> }> {
  const images = new Map<string, HTMLImageElement>();

  for (const tex of project.textures) {
    if (!tex.source) continue;
    const pngBlob = await zipFileOrThrow(zip, tex.source, tex.id, 'texture').async('blob');
    const blobUrl = URL.createObjectURL(pngBlob);
    resources.track(blobUrl);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        images.set(tex.id, img);
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to decode texture ${tex.id}`));
      img.src = blobUrl;
    });

    tex.source = blobUrl;
  }

  for (const node of project.nodes) {
    if (node.type === 'part' && node.mesh) {
      node.mesh.uvs = new Float32Array(node.mesh.uvs);
    }
  }

  for (const animation of project.animations ?? []) {
    if (!animation.audioTracks) animation.audioTracks = [];
    for (const track of animation.audioTracks) {
      if (track.source) {
        const audioBlob = await zipFileOrThrow(zip, track.source, track.id, 'audio').async('blob');
        const audioUrl = URL.createObjectURL(audioBlob);
        resources.track(audioUrl);
        track.sourceUrl = audioUrl;
        delete track.source;
      }
    }
  }

  return { images };
}

export async function loadProject(file: Blob | ArrayBuffer | Uint8Array): Promise<LoadedProjectBundle> {
  const zip = await inspectZip(file);
  const rawProject = await readProjectJson(zip);
  const migrated = migrate(rawProject);
  const validated = validate(migrated);
  const project = prepareLoadedProjectDocument(validated);

  const resources = createProjectResourceOwner();
  try {
    const { images } = await materializeBlobUrls(zip, project, resources);
    return { project, images, resources };
  } catch (err: unknown) {
    resources.dispose();
    throw err;
  }
}
