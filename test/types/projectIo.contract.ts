import { createEmptyProject } from "@/core/createEmptyProject";
import type { Mesh, ProjectDocument } from "@kukla2d/contracts";
import type {
  LoadedProjectBundle,
  ProjectResourceOwner,
  AssetResolveError,
  ProjectArchiveManifest,
} from "@kukla2d/contracts";
import type { ValidatedProjectDocument } from "@/schema/projectSchema.types";
import type { PortableProjectDocument } from "@/schema/projectSnapshot.types";

declare const bundle: LoadedProjectBundle;
declare const owner: ProjectResourceOwner;
declare const error: AssetResolveError;
declare const manifest: ProjectArchiveManifest;

const _contractBundle: LoadedProjectBundle = bundle;
const _contractOwner: ProjectResourceOwner = owner;
const _contractError: AssetResolveError = error;
const _contractManifest: ProjectArchiveManifest = manifest;

const empty = createEmptyProject();
const meshWithFloat32: Mesh = {
  vertices: [],
  uvs: new Float32Array([0, 0, 1, 0]),
  triangles: [],
  edgeIndices: [],
};
const _runtimeFloat32Accepted = meshWithFloat32;

const meshWithArray: Mesh = {
  vertices: [],
  uvs: [0, 0, 1, 0],
  triangles: [],
  edgeIndices: [],
};
const _runtimeArrayAccepted = meshWithArray;

const _doc: ProjectDocument = empty;

const validatedDoc: ValidatedProjectDocument =
  null as unknown as ValidatedProjectDocument;

const _validatedMeshUvs: number[] | undefined =
  validatedDoc.nodes[0]?.type === "part"
    ? validatedDoc.nodes[0]?.mesh?.uvs
    : undefined;

const portableDoc: PortableProjectDocument =
  null as unknown as PortableProjectDocument;

const _portableMeshUvs: number[] | undefined =
  portableDoc.nodes[0]?.type === "part"
    ? portableDoc.nodes[0]?.mesh?.uvs
    : undefined;

const _assetType1: AssetResolveError["assetType"] = "texture";
const _assetType2: AssetResolveError["assetType"] = "audio";

// @ts-expect-error - validated/portable doc mesh.uvs is number[], Float32Array not assignable
const _badFloat32ForSchemaUvs: number[] = new Float32Array([0, 0]);

void _contractBundle;
void _contractOwner;
void _contractError;
void _contractManifest;
void _runtimeFloat32Accepted;
void _runtimeArrayAccepted;
void _doc;
void validatedDoc;
void _validatedMeshUvs;
void portableDoc;
void _portableMeshUvs;
void _assetType1;
void _assetType2;
void _badFloat32ForSchemaUvs;
