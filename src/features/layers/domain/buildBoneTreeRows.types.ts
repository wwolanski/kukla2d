import type { Bone, BoneId, Constraint, PartNode } from "@kukla2d/contracts";

interface RootRow {
  kind: "root" | "unassigned";
  key: string;
  depth: number;
}

interface BoneRow {
  kind: "bone";
  key: string;
  bone: Bone;
  familyId: BoneId;
  parentName: string | null;
  depth: number;
  hasChildren: boolean;
  assignedCount: number;
  influencedCount: number;
  ikConstraints: Constraint[];
}

interface NodeRow {
  kind: "node" | "meshInfluence";
  key: string;
  node: PartNode;
  depth: number;
  boneId: BoneId | null;
  boneName?: string;
  familyId?: BoneId;
}

export type BoneTreeRow = RootRow | BoneRow | NodeRow;
