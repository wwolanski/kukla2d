import type { Mesh, Node, ProjectDocument } from "@kukla2d/contracts";

import { validateProject } from "@/schema/projectSchema";
import { createPortableProjectSnapshot } from "@/schema/projectSnapshot";

import type {
  ProjectReadinessIssue,
  ProjectReadinessReport,
  ProjectReadinessTarget,
} from "./projectReadiness.types.js";

type ProjectReadinessInput = Partial<ProjectDocument>;
type IssueClassification = "baked" | "dropped";

const VALID_TARGETS: ReadonlySet<string> = new Set<ProjectReadinessTarget>([
  "stretch",
  "frames",
  "spine",
  "live2d",
  "live2d_project",
  "phaser_atlas",
]);

function issue(
  code: string,
  path: string | number,
  message: string,
  classification?: IssueClassification,
): ProjectReadinessIssue {
  return {
    code,
    path: String(path),
    message: String(message),
    ...(classification ? { classification } : {}),
  };
}

function checkDocumentValid(
  project: ProjectReadinessInput,
  errors: ProjectReadinessIssue[],
): void {
  let snapshot: ReturnType<typeof createPortableProjectSnapshot>;
  try {
    snapshot = createPortableProjectSnapshot(project as ProjectDocument);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(
      issue("DOCUMENT_INVALID", "$", `Snapshot creation failed: ${message}`),
    );
    return;
  }

  const result = validateProject(snapshot);
  if (!result.success) {
    for (const zodIssue of result.error.issues) {
      const path = ["$", ...zodIssue.path.map(String)].join(".");
      errors.push(issue("DOCUMENT_INVALID", path, zodIssue.message));
    }
  }
}

function checkAssetSources(
  project: ProjectReadinessInput,
  errors: ProjectReadinessIssue[],
): void {
  const textures = project.textures ?? [];
  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i]!;
    if (
      !tex.source ||
      (typeof tex.source === "string" && tex.source.trim() === "")
    ) {
      errors.push(
        issue(
          "ASSET_SOURCE_MISSING",
          `textures[${i}].source`,
          `Texture "${tex.id}" has no source`,
        ),
      );
    }
  }

  const animations = project.animations ?? [];
  for (let ai = 0; ai < animations.length; ai++) {
    const animation = animations[ai]!;
    const audioTracks = animation.audioTracks ?? [];
    for (let ati = 0; ati < audioTracks.length; ati++) {
      const at = audioTracks[ati]!;
      if (!at.source && !at.sourceUrl) {
        errors.push(
          issue(
            "ASSET_SOURCE_MISSING",
            `animations[${ai}].audioTracks[${ati}].source`,
            `Audio track "${at.id}" has no source`,
          ),
        );
      }
    }
  }
}

function getVertexCount(mesh: Mesh | null | undefined): number {
  if (!mesh || !mesh.vertices) return 0;
  return mesh.vertices.length;
}

function getArrayLength(arr: ArrayLike<unknown> | null | undefined): number {
  if (!arr) return 0;
  return arr.length;
}

function checkMeshTopology(
  project: ProjectReadinessInput,
  errors: ProjectReadinessIssue[],
): void {
  const nodes = project.nodes ?? [];
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni]!;
    if (node.type !== "part" || !node.mesh) continue;
    const mesh = node.mesh;
    const vc = getVertexCount(mesh);
    const path = `nodes[${ni}]`;

    const uvLen = getArrayLength(mesh.uvs);
    if (uvLen !== vc * 2) {
      errors.push(
        issue(
          "MESH_TOPOLOGY_INVALID",
          `${path}.mesh.uvs`,
          `UV count ${uvLen} must equal vertices.length * 2 (${vc * 2}) on node "${node.id}"`,
        ),
      );
    }

    const triangles = mesh.triangles ?? [];
    for (let ti = 0; ti < triangles.length; ti++) {
      const tri = triangles[ti]!;
      for (let j = 0; j < 3; j++) {
        const idx = tri[j]!;
        if (idx < 0 || idx >= vc) {
          errors.push(
            issue(
              "MESH_TOPOLOGY_INVALID",
              `${path}.mesh.triangles[${ti}]`,
              `Triangle index ${idx} out of range [0, ${vc}) on node "${node.id}"`,
            ),
          );
        }
      }
    }

    if (mesh.boneWeights && getArrayLength(mesh.boneWeights) !== vc) {
      errors.push(
        issue(
          "MESH_TOPOLOGY_INVALID",
          `${path}.mesh.boneWeights`,
          `boneWeights length ${getArrayLength(mesh.boneWeights)} must equal vertices.length ${vc} on node "${node.id}"`,
        ),
      );
    }

    if (mesh.influences && getArrayLength(mesh.influences) !== vc) {
      errors.push(
        issue(
          "MESH_TOPOLOGY_INVALID",
          `${path}.mesh.influences`,
          `influences length ${getArrayLength(mesh.influences)} must equal vertices.length ${vc} on node "${node.id}"`,
        ),
      );
    }

    const blendShapes = node.blendShapes ?? [];
    for (let bi = 0; bi < blendShapes.length; bi++) {
      const shape = blendShapes[bi]!;
      if (getArrayLength(shape.deltas) !== vc) {
        errors.push(
          issue(
            "MESH_TOPOLOGY_INVALID",
            `${path}.blendShapes[${bi}].deltas`,
            `blendShape "${shape.id}" deltas length ${getArrayLength(shape.deltas)} must equal vertices.length ${vc} on node "${node.id}"`,
          ),
        );
      }
    }
  }
}

function checkMeshTrackVertexCount(
  project: ProjectReadinessInput,
  errors: ProjectReadinessIssue[],
): void {
  const nodesById = new Map<string, Node>(
    (project.nodes ?? []).map((node) => [node.id, node]),
  );
  const animations = project.animations ?? [];

  for (let ai = 0; ai < animations.length; ai++) {
    const animation = animations[ai]!;
    const tracks = animation.tracks ?? [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti]!;
      if (track.property !== "mesh_verts") continue;

      const node = nodesById.get(track.targetId);
      if (!node || node.type !== "part" || !node.mesh) continue;
      const vc = getVertexCount(node.mesh);

      const keyframes = track.keyframes ?? [];
      for (let ki = 0; ki < keyframes.length; ki++) {
        const kf = keyframes[ki]!;
        if (Array.isArray(kf.value) && kf.value.length !== vc) {
          errors.push(
            issue(
              "MESH_TRACK_VERTEX_COUNT_MISMATCH",
              `animations[${ai}].tracks[${ti}].keyframes[${ki}].value`,
              `mesh_verts keyframe has ${kf.value.length} vertices but mesh on "${track.targetId}" has ${vc} in animation "${animation.id}"`,
            ),
          );
        }
      }
    }
  }
}

function checkDanglingRefs(
  project: ProjectReadinessInput,
  errors: ProjectReadinessIssue[],
): void {
  const nodesById = new Map<string, ProjectDocument["nodes"][number]>(
    (project.nodes ?? []).map((node) => [node.id, node]),
  );
  const bonesById = new Map<string, ProjectDocument["bones"][number]>(
    (project.bones ?? []).map((bone) => [bone.id, bone]),
  );
  const constraintsById = new Map<
    string,
    ProjectDocument["constraints"][number]
  >(
    (project.constraints ?? []).map((constraint) => [
      constraint.id,
      constraint,
    ]),
  );
  const slotsById = new Map<string, ProjectDocument["slots"][number]>(
    (project.slots ?? []).map((slot) => [slot.id, slot]),
  );
  const attachmentsById = new Map<
    string,
    ProjectDocument["attachments"][number]
  >(
    (project.attachments ?? []).map((attachment) => [
      attachment.id,
      attachment,
    ]),
  );

  const animations = project.animations ?? [];
  for (let ai = 0; ai < animations.length; ai++) {
    const animation = animations[ai]!;
    const tracks = animation.tracks ?? [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti]!;
      const targetId = track.targetId;
      if (
        !nodesById.has(targetId) &&
        !bonesById.has(targetId) &&
        !constraintsById.has(targetId)
      ) {
        errors.push(
          issue(
            "DANGLING_TARGET",
            `animations[${ai}].tracks[${ti}].targetId`,
            `Track target "${targetId}" not found in animation "${animation.id}"`,
          ),
        );
      }
    }
  }

  const nodes = project.nodes ?? [];
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni]!;
    if (node.type === "part" && node.clipToPartId != null) {
      const clipTarget = nodesById.get(node.clipToPartId);
      if (!clipTarget) {
        errors.push(
          issue(
            "DANGLING_TARGET",
            `nodes[${ni}].clipToPartId`,
            `clipToPartId "${node.clipToPartId}" not found on node "${node.id}"`,
          ),
        );
      }
    }
  }

  const bones = project.bones ?? [];
  for (let bi = 0; bi < bones.length; bi++) {
    const bone = bones[bi]!;
    if (bone.parentId != null && !bonesById.has(bone.parentId)) {
      errors.push(
        issue(
          "DANGLING_TARGET",
          `bones[${bi}].parentId`,
          `Bone "${bone.id}" parentId "${bone.parentId}" not found`,
        ),
      );
    }
  }

  const skins = project.skins ?? [];
  for (let si = 0; si < skins.length; si++) {
    const skin = skins[si]!;
    const entries = skin.entries ?? [];
    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei]!;
      if (!slotsById.has(entry.slotId)) {
        errors.push(
          issue(
            "DANGLING_TARGET",
            `skins[${si}].entries[${ei}].slotId`,
            `Skin "${skin.id}" entry references unknown slot "${entry.slotId}"`,
          ),
        );
      }
      if (!attachmentsById.has(entry.attachmentId)) {
        errors.push(
          issue(
            "DANGLING_TARGET",
            `skins[${si}].entries[${ei}].attachmentId`,
            `Skin "${skin.id}" entry references unknown attachment "${entry.attachmentId}"`,
          ),
        );
      }
    }
  }
}

function checkAutoMotionRefs(
  project: ProjectReadinessInput,
  _errors: ProjectReadinessIssue[],
  warnings: ProjectReadinessIssue[],
): void {
  const nodesById = new Map<string, ProjectDocument["nodes"][number]>(
    (project.nodes ?? []).map((node) => [node.id, node]),
  );
  const bonesById = new Map<string, ProjectDocument["bones"][number]>(
    (project.bones ?? []).map((bone) => [bone.id, bone]),
  );
  const handlesById = new Map<
    string,
    ProjectDocument["controlHandles"][number]
  >((project.controlHandles ?? []).map((handle) => [handle.id, handle]));

  const handles = project.controlHandles ?? [];
  for (let hi = 0; hi < handles.length; hi++) {
    const handle = handles[hi]!;
    const targetId = handle.target.id;
    switch (handle.target.kind) {
      case "part":
        if (targetId && !nodesById.has(targetId)) {
          warnings.push(
            issue(
              "DANGLING_CONTROL_HANDLE_TARGET",
              `controlHandles[${hi}].target.id`,
              `Control handle "${handle.id}" references unknown node "${targetId}"`,
            ),
          );
        }
        break;
      case "bone":
        if (targetId && !bonesById.has(targetId)) {
          warnings.push(
            issue(
              "DANGLING_CONTROL_HANDLE_TARGET",
              `controlHandles[${hi}].target.id`,
              `Control handle "${handle.id}" references unknown bone "${targetId}"`,
            ),
          );
        }
        break;
      case "warpDeformer":
        if (targetId && !nodesById.has(targetId)) {
          warnings.push(
            issue(
              "DANGLING_CONTROL_HANDLE_TARGET",
              `controlHandles[${hi}].target.id`,
              `Control handle "${handle.id}" references unknown warp deformer "${targetId}"`,
            ),
          );
        }
        break;
    }
  }

  const modifiers = project.animationModifiers ?? [];
  const presetIds = new Set([
    "builtin.idleBreathing",
    "builtin.headCheekJiggle",
  ]);
  for (let mi = 0; mi < modifiers.length; mi++) {
    const mod = modifiers[mi]!;
    if (!presetIds.has(mod.presetId)) {
      warnings.push(
        issue(
          "MODIFIER_PRESET_UNKNOWN",
          `animationModifiers[${mi}].presetId`,
          `Animation modifier "${mod.id}" uses unknown preset "${mod.presetId}"`,
        ),
      );
    }

    if (mod.driver?.kind === "boneMotion" && mod.driver.sourceBoneId != null) {
      const sourceBoneId = mod.driver.sourceBoneId;
      if (!bonesById.has(sourceBoneId)) {
        warnings.push(
          issue(
            "DANGLING_MODIFIER_TARGET",
            `animationModifiers[${mi}].driver.sourceBoneId`,
            `Modifier "${mod.id}" references source bone "${sourceBoneId}" not found`,
          ),
        );
      }
    }

    for (const output of mod.outputs ?? []) {
      const targetId = output.targetId;
      if (output.kind === "blendShapeValue") {
        const node = nodesById.get(targetId);
        if (!node) {
          warnings.push(
            issue(
              "MODIFIER_OUTPUT_TARGET_MISSING",
              `animationModifiers[${mi}].outputs`,
              `Modifier "${mod.id}" output targets missing node "${targetId}"`,
            ),
          );
        } else if (
          node.type !== "part" ||
          !node.blendShapes ||
          !node.blendShapes.some((s) => s.id === output.property)
        ) {
          warnings.push(
            issue(
              "MODIFIER_BLENDSHAPE_MISSING",
              `animationModifiers[${mi}].outputs`,
              `Modifier "${mod.id}" output references blendShape "${output.property}" not found on node "${targetId}"`,
            ),
          );
        }
        if (
          node &&
          node.type === "part" &&
          node.blendShapes?.some((s) => s.id === output.property)
        ) {
          const shape = node.blendShapes.find((s) => s.id === output.property);
          const vc = node.mesh?.vertices?.length ?? 0;
          if (shape && vc > 0 && shape.deltas?.length !== vc) {
            warnings.push(
              issue(
                "MODIFIER_MESH_TOPOLOGY_MISMATCH",
                `animationModifiers[${mi}].outputs`,
                `Modifier "${mod.id}" output blendShape "${output.property}" deltas length ${shape.deltas.length} does not match vertex count ${vc} on node "${targetId}"`,
              ),
            );
          }
        }
      } else if (output.kind === "nodeTransform") {
        if (!nodesById.has(targetId)) {
          warnings.push(
            issue(
              "MODIFIER_OUTPUT_TARGET_MISSING",
              `animationModifiers[${mi}].outputs`,
              `Modifier "${mod.id}" output targets missing node "${targetId}"`,
            ),
          );
        }
      } else if (output.kind === "boneTransform") {
        if (!bonesById.has(targetId)) {
          warnings.push(
            issue(
              "MODIFIER_OUTPUT_TARGET_MISSING",
              `animationModifiers[${mi}].outputs`,
              `Modifier "${mod.id}" output targets missing bone "${targetId}"`,
            ),
          );
        }
      }
    }
    for (const [role, binding] of Object.entries(mod.bindings ?? {})) {
      if (binding.target === "handle") {
        const matchingHandle = Array.from(handlesById.values()).find(
          (h) => h.role === role,
        );
        if (!matchingHandle) {
          warnings.push(
            issue(
              "DANGLING_MODIFIER_TARGET",
              `animationModifiers[${mi}].bindings.${role}`,
              `Modifier "${mod.id}" binding references unknown control handle role "${role}"`,
            ),
          );
        }
      }
    }
  }
}

function checkTargetSpecific(
  target: ProjectReadinessTarget,
  project: ProjectReadinessInput,
  errors: ProjectReadinessIssue[],
  warnings: ProjectReadinessIssue[],
): void {
  if (target === "frames") {
    const animations = project.animations ?? [];
    if (animations.length === 0) {
      errors.push(
        issue(
          "CAPTURE_REQUEST_UNSUPPORTED",
          "animations",
          "No animations to export for frames target",
        ),
      );
    }
  }

  if (target === "phaser_atlas") {
    const animations = project.animations ?? [];
    if (animations.length === 0) {
      errors.push(
        issue(
          "CAPTURE_REQUEST_UNSUPPORTED",
          "animations",
          "No animations to export for phaser_atlas target",
        ),
      );
    }

    const canvas = project.canvas;
    if (
      !canvas ||
      !Number.isFinite(canvas.width) ||
      canvas.width <= 0 ||
      !Number.isFinite(canvas.height) ||
      canvas.height <= 0
    ) {
      errors.push(
        issue(
          "DOCUMENT_INVALID",
          "canvas",
          "Canvas dimensions must be positive for phaser_atlas export",
        ),
      );
    }

    const nodes = project.nodes ?? [];
    const hasBones = (project.bones ?? []).length > 0;
    const hasMesh = nodes.some((n) => n.type === "part" && n.mesh);
    const hasModifiers = (project.animationModifiers ?? []).length > 0;
    const hasConstraints = (project.constraints ?? []).length > 0;

    if (hasBones || hasMesh || hasModifiers || hasConstraints) {
      const features: string[] = [];
      if (hasBones) features.push("bones");
      if (hasMesh) features.push("mesh");
      if (hasModifiers) features.push("modifiers");
      if (hasConstraints) features.push("constraints");
      warnings.push(
        issue(
          "BAKED_RUNTIME_FEATURES",
          "$",
          `Runtime features (${features.join(", ")}) will be baked into frame pixels — no runtime deformation, IK, or physics`,
          "baked",
        ),
      );
    }

    const hasAudio = animations.some((a) => (a.audioTracks ?? []).length > 0);
    if (hasAudio) {
      warnings.push(
        issue(
          "BAKED_AUDIO_EXCLUDED",
          "$",
          "Audio tracks are excluded from Phaser atlas package — only visual frames are exported",
          "dropped",
        ),
      );
    }
  }

  if (target === "spine") {
    warnings.push(
      issue(
        "DANGLING_TARGET",
        "$",
        "Spine adapter format compliance is BRAK DANYCH — exact binary compatibility not verified",
      ),
    );
  }

  if (target === "live2d" || target === "live2d_project") {
    warnings.push(
      issue(
        "DANGLING_TARGET",
        "$",
        "Live2D adapter format compliance is BRAK DANYCH — exact CMO3/MOC3 compatibility not verified",
      ),
    );
  }
}

export function analyzeProjectReadiness(
  project: ProjectReadinessInput,
  target: string,
): ProjectReadinessReport {
  const errors: ProjectReadinessIssue[] = [];
  const warnings: ProjectReadinessIssue[] = [];

  if (!VALID_TARGETS.has(target)) {
    errors.push(
      issue(
        "CAPTURE_REQUEST_UNSUPPORTED",
        "target",
        `Unknown target "${target}"`,
      ),
    );
    return { errors, warnings };
  }

  checkDocumentValid(project, errors);
  checkAssetSources(project, errors);
  checkMeshTopology(project, errors);
  checkMeshTrackVertexCount(project, errors);
  checkDanglingRefs(project, errors);
  checkAutoMotionRefs(project, errors, warnings);
  checkTargetSpecific(
    target as ProjectReadinessTarget,
    project,
    errors,
    warnings,
  );

  return { errors, warnings };
}
