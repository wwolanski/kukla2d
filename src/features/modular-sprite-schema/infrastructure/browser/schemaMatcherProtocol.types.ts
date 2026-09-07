import type {
  MatchProgressEvent,
  ModularSpriteSchema,
  SchemaMatchRequest,
  SchemaMatchResponse,
} from "@kukla2d/modular-sprite-schema";

export type SchemaMatcherWorkerRequest =
  | { type: "catalog"; catalogRevision: string; schemas: ModularSpriteSchema[] }
  | { type: "match"; request: SchemaMatchRequest }
  | { type: "abort"; requestId: string };
export type SchemaMatcherWorkerResponse =
  | { type: "ready"; catalogRevision: string }
  | { type: "progress"; requestId: string; event: MatchProgressEvent }
  | { type: "result"; response: SchemaMatchResponse }
  | { type: "error"; requestId: string; message: string };
