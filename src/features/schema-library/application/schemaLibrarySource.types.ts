import type { ModularSpriteSchema } from "@kukla2d/modular-sprite-schema";

export type SchemaLibraryOriginFilter = "all" | "local" | "remote";
export type SchemaLibraryStatus = "idle" | "loading" | "ready" | "error";

export interface SchemaLibrarySourceDescriptor {
  id: string;
  label: string;
  detail: string;
  kind: "local" | "remote";
}

export interface SchemaLibrarySource {
  descriptor: SchemaLibrarySourceDescriptor;
  initialize(): Promise<void>;
  list(): Promise<readonly ModularSpriteSchema[]>;
  getAsset(assetId: string): Promise<Blob | undefined>;
}
