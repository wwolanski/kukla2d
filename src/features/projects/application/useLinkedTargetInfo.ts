import { useMemo } from "react";

import type { Bone, BoneId, NodeId } from "@kukla2d/contracts";

import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

interface LinkedTargetInfo {
  nodeId: NodeId;
  nodeName: string;
  boneId: BoneId;
  boneName: string;
}

export function useLinkedTargetInfo(): LinkedTargetInfo | null {
  const mode = useEditorStore((state) => state.editorMode);
  const selection = useEditorStore((state) => state.selection);
  const project = useProjectStore((state) => state.project);

  return useMemo(() => {
    if (mode !== "animation" || selection.length !== 1) return null;

    const selectionId = selection[0]!;
    const node = (project.nodes ?? []).find(
      (candidate) => candidate.id === selectionId,
    );
    if (!node || node.type !== "part" || node.boneLinkLocked === false)
      return null;

    const linkedBoneId = node.boneId ?? node.mesh?.jointBoneId;
    if (!linkedBoneId) return null;

    const bone = (project.bones ?? []).find(
      (candidate: Bone) => candidate.id === linkedBoneId,
    );
    if (!bone) return null;

    return {
      nodeId: node.id,
      nodeName: node.name,
      boneId: bone.id,
      boneName: bone.name,
    };
  }, [mode, selection, project]);
}
