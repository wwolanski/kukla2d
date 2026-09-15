export type DragSourceKind =
  "node" | "bone" | "asset" | "folder" | "libraryAsset" | "libraryFolder";
export type DragTargetKind =
  | "node"
  | "bone"
  | "unassigned"
  | "root"
  | "folder"
  | "asset";
export type DropPosition = "before" | "after" | "inside";

export interface DragSession {
  sourceKind: DragSourceKind;
  sourceId: string;
  targetKind: DragTargetKind | null;
  targetId: string | null;
  dropPosition: DropPosition | null;
}
