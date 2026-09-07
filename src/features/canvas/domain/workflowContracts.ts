import type {
  EditorCommand,
  ModifierState,
} from "./workflowContracts.types.js";

interface Point2D {
  x: number;
  y: number;
}

interface InteractionTarget {
  kind: string;
  id?: string;
}

interface WorkflowFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

type EditorInteractionEvent = {
  type:
    | "pointerDown"
    | "pointerMove"
    | "pointerUp"
    | "pointerCancel"
    | "dropFiles"
    | "dragFilesEnter"
    | "dragFilesLeave"
    | "keyDown"
    | "keyUp";
  pointer: Point2D | null;
  screen: Point2D | null;
  world: Point2D | null;
  modifiers: ModifierState;
  button: number;
  target: InteractionTarget | null;
  files?: readonly WorkflowFile[];
  key?: string;
};

type EditorCommandType = EditorCommand["type"];
type CacheEntryStatus = "idle" | "active" | "committed" | "cancelled";

interface GestureComputationCacheEntry {
  sessionId: number;
  status: CacheEntryStatus;
  previewOverrides: Map<string, Record<string, unknown>> | null;
  startPositions: Map<string, Record<string, unknown>> | null;
  metadata: Record<string, unknown>;
}

const DEFAULT_MODIFIERS: Readonly<ModifierState> = Object.freeze({
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
});

export function createPointerDownEvent(
  pointer: Point2D | null = null,
  world: Point2D | null = null,
  screen: Point2D | null = null,
  modifiers: Partial<ModifierState> = {},
  button = 0,
  target: InteractionTarget | null = null,
): EditorInteractionEvent {
  return {
    type: "pointerDown",
    pointer,
    screen,
    world,
    modifiers: { ...DEFAULT_MODIFIERS, ...modifiers },
    button,
    target,
  };
}

export function createPointerMoveEvent(
  pointer: Point2D | null = null,
  world: Point2D | null = null,
  screen: Point2D | null = null,
  modifiers: Partial<ModifierState> = {},
): EditorInteractionEvent {
  return {
    type: "pointerMove",
    pointer,
    screen,
    world,
    modifiers: { ...DEFAULT_MODIFIERS, ...modifiers },
    button: 0,
    target: null,
  };
}

export function createPointerUpEvent(
  pointer: Point2D | null = null,
  world: Point2D | null = null,
  screen: Point2D | null = null,
  modifiers: Partial<ModifierState> = {},
  button = 0,
): EditorInteractionEvent {
  return {
    type: "pointerUp",
    pointer,
    screen,
    world,
    modifiers: { ...DEFAULT_MODIFIERS, ...modifiers },
    button,
    target: null,
  };
}

export function createPointerCancelEvent(): EditorInteractionEvent {
  return {
    type: "pointerCancel",
    pointer: null,
    screen: null,
    world: null,
    modifiers: { ...DEFAULT_MODIFIERS },
    button: 0,
    target: null,
  };
}

export function createDropFilesEvent(
  files: readonly WorkflowFile[],
  pointer: Point2D | null = null,
): EditorInteractionEvent {
  return {
    type: "dropFiles",
    pointer,
    screen: null,
    world: null,
    modifiers: { ...DEFAULT_MODIFIERS },
    button: 0,
    target: null,
    files,
  };
}

export function createDragFilesEnterEvent(
  files: readonly WorkflowFile[],
  pointer: Point2D | null = null,
): EditorInteractionEvent {
  return {
    type: "dragFilesEnter",
    pointer,
    screen: null,
    world: null,
    modifiers: { ...DEFAULT_MODIFIERS },
    button: 0,
    target: null,
    files,
  };
}

export function createDragFilesLeaveEvent(): EditorInteractionEvent {
  return {
    type: "dragFilesLeave",
    pointer: null,
    screen: null,
    world: null,
    modifiers: { ...DEFAULT_MODIFIERS },
    button: 0,
    target: null,
  };
}

export function createKeyDownEvent(
  key: string,
  modifiers: Partial<ModifierState> = {},
): EditorInteractionEvent {
  return {
    type: "keyDown",
    pointer: null,
    screen: null,
    world: null,
    modifiers: { ...DEFAULT_MODIFIERS, ...modifiers },
    button: 0,
    target: null,
    key,
  };
}

export function createEditorCommand(
  type: "clearSelection",
  payload?: Extract<EditorCommand, { type: "clearSelection" }>["payload"],
  sessionId?: number,
): Extract<EditorCommand, { type: "clearSelection" }>;
export function createEditorCommand<T extends EditorCommandType>(
  type: T,
  payload: Extract<EditorCommand, { type: T }>["payload"],
  sessionId?: number,
): Extract<EditorCommand, { type: T }>;
export function createEditorCommand(
  type: EditorCommandType,
  payload: unknown = {},
  sessionId?: number,
): EditorCommand {
  return {
    type,
    payload,
    ...(sessionId === undefined ? {} : { sessionId }),
  } as EditorCommand;
}

export function createGestureComputationCacheEntry(
  sessionId: number,
): GestureComputationCacheEntry {
  return {
    sessionId,
    status: "active",
    previewOverrides: null,
    startPositions: null,
    metadata: {},
  };
}

export function updateGestureCacheEntry(
  entry: GestureComputationCacheEntry,
  patch: Partial<
    Pick<
      GestureComputationCacheEntry,
      "status" | "previewOverrides" | "startPositions" | "metadata"
    >
  >,
): GestureComputationCacheEntry {
  return {
    ...entry,
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.previewOverrides === undefined
      ? {}
      : { previewOverrides: patch.previewOverrides }),
    ...(patch.startPositions === undefined
      ? {}
      : { startPositions: patch.startPositions }),
    ...(patch.metadata === undefined
      ? {}
      : { metadata: { ...entry.metadata, ...patch.metadata } }),
  };
}
