import type {
  StateMachineState,
  StateMachineTransition,
} from "./stateMachine.types.js";

type TransitionEvaluation =
  | {
      state: "transitioned";
      newStateId: string;
      crossfadeDuration: number;
      easing: string;
      transitionId: string;
    }
  | {
      state: "unchanged";
      newStateId: null;
      crossfadeDuration: 0;
      easing: "linear";
      reason: "STATE_NOT_FOUND" | "NO_MATCH";
    };

type StateMachineDiagnostic =
  | { code: "DUPLICATE_STATE"; stateId: string }
  | { code: "FROM_STATE_NOT_FOUND"; transitionId: string; stateId: string }
  | { code: "TO_STATE_NOT_FOUND"; transitionId: string; stateId: string };

interface StateMachineValidation {
  valid: boolean;
  diagnostics: readonly StateMachineDiagnostic[];
  errors: readonly string[];
}

export function evaluateTransitions(
  states: readonly StateMachineState[],
  transitions: readonly StateMachineTransition[],
  currentStateId: string,
  parameters: Readonly<Record<string, number>>,
  stateTime: number,
  clipDuration: number,
): TransitionEvaluation {
  if (!states.some((state) => state.id === currentStateId)) {
    return unchanged("STATE_NOT_FOUND");
  }
  const match = transitions.find(
    (transition) =>
      transition.fromStateId === currentStateId &&
      isTransitionSatisfied(transition, parameters, stateTime, clipDuration),
  );
  if (!match) return unchanged("NO_MATCH");
  return {
    state: "transitioned",
    newStateId: match.toStateId,
    crossfadeDuration: match.duration ?? 0,
    easing: match.easing ?? "linear",
    transitionId: match.id,
  };
}

export function validateStateMachine(
  states: readonly StateMachineState[],
  transitions: readonly StateMachineTransition[],
): StateMachineValidation {
  const diagnostics: StateMachineDiagnostic[] = [];
  const stateIds = new Set<string>();
  for (const state of states) {
    if (stateIds.has(state.id))
      diagnostics.push({ code: "DUPLICATE_STATE", stateId: state.id });
    stateIds.add(state.id);
  }
  for (const transition of transitions) {
    if (!stateIds.has(transition.fromStateId)) {
      diagnostics.push({
        code: "FROM_STATE_NOT_FOUND",
        transitionId: transition.id,
        stateId: transition.fromStateId,
      });
    }
    if (!stateIds.has(transition.toStateId)) {
      diagnostics.push({
        code: "TO_STATE_NOT_FOUND",
        transitionId: transition.id,
        stateId: transition.toStateId,
      });
    }
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics,
    errors: diagnostics.map(formatDiagnostic),
  };
}

function isTransitionSatisfied(
  transition: StateMachineTransition,
  parameters: Readonly<Record<string, number>>,
  stateTime: number,
  clipDuration: number,
): boolean {
  if (transition.condition === "exitTime") {
    return (
      (clipDuration > 0 ? stateTime / clipDuration : 0) >=
      (transition.exitTime ?? 1)
    );
  }
  if (transition.condition === "parameter") {
    const value = parameters[transition.paramName] ?? 0;
    const threshold = transition.threshold ?? 0;
    switch (transition.comparison) {
      case "greater":
        return value > threshold;
      case "less":
        return value < threshold;
      case "equals":
        return Math.abs(value - threshold) < 0.001;
    }
  }
  return true;
}

function unchanged(
  reason: "STATE_NOT_FOUND" | "NO_MATCH",
): TransitionEvaluation {
  return {
    state: "unchanged",
    newStateId: null,
    crossfadeDuration: 0,
    easing: "linear",
    reason,
  };
}

function formatDiagnostic(diagnostic: StateMachineDiagnostic): string {
  switch (diagnostic.code) {
    case "DUPLICATE_STATE":
      return `State "${diagnostic.stateId}" is duplicated`;
    case "FROM_STATE_NOT_FOUND":
      return `Transition ${diagnostic.transitionId}: fromStateId "${diagnostic.stateId}" not found`;
    case "TO_STATE_NOT_FOUND":
      return `Transition ${diagnostic.transitionId}: toStateId "${diagnostic.stateId}" not found`;
  }
}
