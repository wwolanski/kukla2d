export {
  validateProject,
  parseProject,
  CURRENT_PROJECT_VERSION,
} from "../../../src/schema/projectSchema.js";
export type {
  ProjectDocumentInput,
  ValidatedProjectDocument,
} from "../../../src/schema/projectSchema.types.js";
export { migrateProject } from "../../../src/schema/migrateProject.js";
export { createEmptyProject } from "../../../src/core/createEmptyProject.js";
export { checkEventCrossing } from "../../../src/schema/eventSchema.js";
export type {
  EventDefinition,
  EventKeyframe,
  EventValue,
} from "../../../src/schema/eventSchema.types.js";
export {
  createTrackBinding,
  validateKeyframeValue,
  isDiscreteType,
  deduplicateKeyframes,
  VALUE_TYPES,
  TARGET_TYPES,
} from "../../../src/schema/trackBinding.js";
export type {
  TrackBinding,
  TimedKeyframe,
  ValueType,
  TargetType,
} from "../../../src/schema/trackBinding.types.js";
export {
  createPortableProjectSnapshot,
  assertJsonSafe,
  validatePortableSnapshot,
} from "../../../src/schema/projectSnapshot.js";
export type {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  PortableProjectDocument,
} from "../../../src/schema/projectSnapshot.types.js";
