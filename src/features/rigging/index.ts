export { createBoneSetupFromNode } from "@/features/rigging/domain/createBoneSetupFromNode.js";
export {
  assignNodeToBone,
  clearNodeBoneAssignment,
  assignProjectNodeToBone,
  clearProjectNodeBoneAssignment,
  isNodeAssignedToBone,
  isNodeDirectlyAssignedToBone,
  doesBoneInfluenceNode,
  getNodeMeshInfluenceBoneIds,
  setNodeMeshInfluenceBone,
  assignOrAddProjectNodeBoneInfluence,
  isBoneLinkLocked,
  setBoneLinkLocked,
  getAssignedBoneForNode,
  getLinkedNodesForBone,
  isLinkedNodeAssignedToBone,
} from "@/features/rigging/domain/boneAssignment.js";
export {
  translateLinkedBoneGroup,
  translateLinkedBoneSelection,
  translateLinkedNodeGroup,
  rotateLinkedNodeGroup,
  scaleLinkedNodeGroup,
  rotateLinkedBone,
  rotateLinkedBoneSelection,
  setBoneLength,
  scaleBoneSelectionLengths,
  applyLinkedTranslation,
} from "@/features/rigging/domain/linkedTransform.js";
export { BONE_TOOL_DEFAULTS } from "@/features/rigging/domain/boneToolDefaults.js";
