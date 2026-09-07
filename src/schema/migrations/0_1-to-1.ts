import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = "0.1" as const;
export const TO_VERSION = 1 as const;

export function migrate_0_1_to_1(
  project: MigrationDocument,
): MigrationDocument {
  const migrated: MigrationDocument = { ...project };

  migrated.version = 1;

  const canvasFields: Record<string, unknown> = isPlainObject(migrated.canvas)
    ? migrated.canvas
    : {};
  migrated.canvas = {
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    ...canvasFields,
  };
  delete migrated.canvas.bgEnabled;
  delete migrated.canvas.bgColor;

  migrated.textures = migrated.textures ?? [];
  migrated.nodes = migrated.nodes ?? [];
  migrated.animations = migrated.animations ?? [];
  delete migrated.parameters;
  migrated.physics_groups = migrated.physics_groups ?? [];
  migrated.physicsRules = migrated.physicsRules ?? [];

  const nodes = migrated.nodes;
  for (const node of nodes) {
    if (node.blendShapes === undefined) node.blendShapes = [];
    if (node.blendShapeValues === undefined) node.blendShapeValues = {};
    if (node.type === "warpDeformer") {
      if (node.col === undefined) node.col = 2;
      if (node.row === undefined) node.row = 2;
      if (node.gridW === undefined) node.gridW = 200;
      if (node.gridH === undefined) node.gridH = 200;
      if (node.gridX === undefined) node.gridX = 0;
      if (node.gridY === undefined) node.gridY = 0;
      delete node.parameterId;
    }
  }

  const animations = migrated.animations;
  for (const animation of animations) {
    animation.tracks = (animation.tracks ?? []).filter(
      (t) => t.property !== "puppet_pins",
    );
    animation.audioTracks = animation.audioTracks ?? [];
  }

  return migrated;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
