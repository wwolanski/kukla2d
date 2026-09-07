import type { GestureKind, GestureSession } from "./gestureSession.types.js";

let nextSessionId = 1;

export function createGestureSession(
  kind: GestureKind,
  payload: Record<string, unknown> = {},
): GestureSession {
  return {
    id: nextSessionId++,
    kind,
    payload: { ...payload },
    historyTransactionId: null,
    status: "active",
  };
}

export function updateGesturePayload(
  session: GestureSession,
  patch: Record<string, unknown>,
): GestureSession {
  return { ...session, payload: { ...session.payload, ...patch } };
}

export function commitGestureSession(session: GestureSession): GestureSession {
  return { ...session, status: "committed" };
}

export function cancelGestureSession(session: GestureSession): GestureSession {
  return { ...session, status: "cancelled" };
}
