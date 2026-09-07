import type { AnimationId, NodeId } from "./errors.types.js";
import type { Transform } from "./project.types.js";

export type CommandKind =
  | "updateNode"
  | "updateTransform"
  | "createNode"
  | "deleteNode"
  | "updateAnimation"
  | "updateCanvas";

export interface Command {
  id: string;
  kind: CommandKind;
  label: string;
  apply: (project: unknown) => void;
  revert: (project: unknown) => void;
  mergeKey?: string;
}

export interface UpdateNodeCommand extends Command {
  kind: "updateNode";
  nodeId: NodeId;
  patch: Partial<unknown>;
}

export interface UpdateTransformCommand extends Command {
  kind: "updateTransform";
  nodeId: NodeId;
  transform: Transform;
}

export interface CreateNodeCommand extends Command {
  kind: "createNode";
  node: unknown;
}

export interface DeleteNodeCommand extends Command {
  kind: "deleteNode";
  nodeId: NodeId;
}

export interface UpdateAnimationCommand extends Command {
  kind: "updateAnimation";
  animationId: AnimationId;
  patch: Partial<unknown>;
}

export type DocumentCommand =
  | UpdateNodeCommand
  | UpdateTransformCommand
  | CreateNodeCommand
  | DeleteNodeCommand
  | UpdateAnimationCommand;
