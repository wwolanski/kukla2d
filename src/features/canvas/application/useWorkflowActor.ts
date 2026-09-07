import { useCallback } from "react";

import { EditorWorkflowContext } from "./EditorWorkflowContext.js";

import type { editorWorkflowMachine } from "./editorWorkflowMachine.js";
import type { WorkflowEvent } from "../domain/workflowContracts.types.js";
import type { SnapshotFrom } from "xstate";

type WorkflowSnapshot = SnapshotFrom<typeof editorWorkflowMachine>;

interface WorkflowActorApi {
  send: (event: WorkflowEvent) => void;
  getState: () => WorkflowSnapshot["value"];
  selectSession: () => WorkflowSnapshot["context"]["activeSession"];
  actorRef: ReturnType<typeof EditorWorkflowContext.useActorRef>;
}

/**
 * useWorkflowActor — context-based XState actor hook.
 *
 * The Provider owns the actor lifecycle. This hook exposes a narrow,
 * stable API for sending events and reading workflow state.
 *
 * Command effects are owned by the configured machine action, so every
 * actorRef.send() path has identical semantics.
 */
export function useWorkflowActor(): WorkflowActorApi {
  const actorRef = EditorWorkflowContext.useActorRef();

  const send = useCallback(
    (event: WorkflowEvent) => {
      actorRef.send(event);
    },
    [actorRef],
  );

  const getState = useCallback(() => {
    return actorRef.getSnapshot().value;
  }, [actorRef]);

  const selectSession = useCallback(() => {
    return actorRef.getSnapshot().context.activeSession;
  }, [actorRef]);

  return { send, getState, selectSession, actorRef };
}

/**
 * useWorkflowSnapshot — narrow selector for workflow snapshot.
 * Preferred over useWorkflowActor for React consumers that only read state.
 */
export function useWorkflowSnapshot(): WorkflowSnapshot {
  return EditorWorkflowContext.useSelector((s) => s);
}

/**
 * useWorkflowSelector — typed selector from workflow snapshot.
 */
export function useWorkflowSelector<T>(
  selector: (snapshot: WorkflowSnapshot) => T,
  compare?: (previous: T, next: T) => boolean,
): T {
  return EditorWorkflowContext.useSelector(selector, compare);
}
