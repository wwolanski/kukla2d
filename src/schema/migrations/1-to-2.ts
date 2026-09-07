import type { MigrationDocument } from "./migrationDocument.types.js";

export const FROM_VERSION = 1 as const;
export const TO_VERSION = 2 as const;

export function migrate_1_to_2(project: MigrationDocument): MigrationDocument {
  const migrated: MigrationDocument = { ...project };
  migrated.version = 2;

  if (!Array.isArray(migrated.bones)) migrated.bones = [];
  if (!Array.isArray(migrated.slots)) migrated.slots = [];
  if (!Array.isArray(migrated.attachments)) migrated.attachments = [];

  const bones = migrated.bones;
  if (bones.length > 0) return migrated;

  const nodes = Array.isArray(migrated.nodes) ? migrated.nodes : [];
  for (const node of nodes) {
    if (node.type !== "group") continue;
    bones.push({
      id: node.id,
      name: node.name,
      parentId: node.parent,
      setup: {
        x: node.transform?.x ?? 0,
        y: node.transform?.y ?? 0,
        rotation: node.transform?.rotation ?? 0,
        scaleX: node.transform?.scaleX ?? 1,
        scaleY: node.transform?.scaleY ?? 1,
        shearX: 0,
        shearY: 0,
        length: 0,
      },
      inherit: "normal",
    });
  }

  if (bones.length === 0) {
    bones.push({
      id: "__root_bone__",
      name: "root",
      parentId: null,
      setup: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        shearX: 0,
        shearY: 0,
        length: 0,
      },
      inherit: "normal",
    });
  }

  const rootBone = bones[0];
  const rootBoneId = rootBone !== undefined ? rootBone.id : "__root_bone__";

  for (const node of nodes) {
    if (node.type !== "part") continue;

    const slotId = `slot_${node.id}`;
    migrated.slots.push({
      id: slotId,
      name: node.name,
      boneId: node.parent ?? rootBoneId,
      setupAttachmentId: `att_${node.id}`,
      color: "ffffffff",
      blendMode: "normal",
      drawOrder: node.draw_order ?? 0,
    });

    const attachmentId = `att_${node.id}`;
    migrated.attachments.push({
      id: attachmentId,
      type: node.mesh ? "mesh" : "region",
      assetId: node.id,
      localTransform: node.transform ? { ...node.transform } : undefined,
      geometry: node.mesh
        ? {
            vertices: node.mesh.vertices,
            triangles: node.mesh.triangles,
            uvs: node.mesh.uvs,
          }
        : undefined,
    });

    if (node.mesh && node.mesh.jointBoneId && node.mesh.boneWeights) {
      const boneId = node.mesh.jointBoneId;
      const weight = node.mesh.boneWeights;
      const vertCount = (node.mesh.vertices?.length ?? 0) / 2;
      node.mesh.influences = Array.from({ length: vertCount }, () => [
        { boneId, weight },
        { boneId: rootBoneId, weight: 1 - weight },
      ]);
    }
  }

  for (const node of nodes) {
    if (node.type !== "warpDeformer") continue;
    bones.push({
      id: node.id,
      name: node.name,
      parentId: node.parent,
      setup: {
        x: node.transform?.x ?? 0,
        y: node.transform?.y ?? 0,
        rotation: node.transform?.rotation ?? 0,
        scaleX: node.transform?.scaleX ?? 1,
        scaleY: node.transform?.scaleY ?? 1,
        shearX: 0,
        shearY: 0,
        length: 0,
      },
      inherit: "normal",
    });
  }

  return migrated;
}
