export interface DeleteSelectionIntent {
  nodeIds: string[];
  boneIds: string[];
  constraintIds: string[];
  parts: string[];
  groups: string[];
  counts: {
    nodes: number;
    bones: number;
    constraints: number;
    parts: number;
    groups: number;
  };
  label: string;
  isEmpty: boolean;
  hasMixedTargets: boolean;
}
