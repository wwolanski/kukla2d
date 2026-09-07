import type { Mesh, Node, ProjectDocument } from "@kukla2d/contracts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface PortableProjectDocument {
  version: number;
  author: ProjectDocument["author"];
  lastActiveAnimationId: ProjectDocument["lastActiveAnimationId"];
  canvas: ProjectDocument["canvas"];
  textures: ProjectDocument["textures"];
  nodes: Array<
    | (Omit<Extract<Node, { type: "part" }>, "mesh"> & {
        mesh?: (Omit<Mesh, "uvs"> & { uvs: number[] }) | null;
      })
    | Extract<Node, { type: "group" | "warpDeformer" }>
  >;
  bones: ProjectDocument["bones"];
  slots: ProjectDocument["slots"];
  attachments: ProjectDocument["attachments"];
  skins: ProjectDocument["skins"];
  constraints: ProjectDocument["constraints"];
  defaultPose: ProjectDocument["defaultPose"];
  animations: ProjectDocument["animations"];
  physics_groups: ProjectDocument["physics_groups"];
  physicsRules: ProjectDocument["physicsRules"];
  libraryFolders: ProjectDocument["libraryFolders"];
  assetPlacements: ProjectDocument["assetPlacements"];
  modularSprites: ProjectDocument["modularSprites"];
  controlHandles: ProjectDocument["controlHandles"];
  animationModifiers: ProjectDocument["animationModifiers"];
}
