import type {
  SchemaMatchRequest,
  SchemaMatchResponse,
} from "@kukla2d/modular-sprite-schema";

export function assertMatchRequest(value: SchemaMatchRequest): void {
  if (
    !value.requestId ||
    !value.matcherProfileId ||
    value.observation.observationVersion !== 1 ||
    !Array.isArray(value.observation.components)
  )
    throw new Error("Invalid schema match request");
}
export function assertMatchResponse(
  value: SchemaMatchResponse,
  requestId: string,
): void {
  if (
    value.requestId !== requestId ||
    value.algorithmVersion < 1 ||
    typeof value.catalogRevision !== "string" ||
    !Array.isArray(value.matches)
  )
    throw new Error("Invalid schema match response");
}
