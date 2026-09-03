import { assign, setup } from 'xstate';

export type ModularSpriteWizardStep = 'source' | 'background' | 'regions' | 'parts' | 'review';

interface WizardContext {
  dirty: boolean;
  error: string | null;
  readiness: Record<'background' | 'regions' | 'parts', boolean>;
}

type WizardEvent =
  | { type: 'SOURCE_SELECTED' }
  | { type: 'DECODED' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'FINALIZE' }
  | { type: 'SUCCESS' }
  | { type: 'FAIL'; message: string }
  | { type: 'RETRY' }
  | { type: 'CHANGE' }
  | { type: 'SET_READY'; step: 'background' | 'regions' | 'parts'; ready: boolean };

export const modularSpriteWizardMachine = setup({
  types: {
    context: {} as WizardContext,
    events: {} as WizardEvent,
  },
  actions: {
    markDirty: assign({ dirty: true }),
    clearError: assign({ error: null }),
    setError: assign({
      error: ({ event }) => event.type === 'FAIL' ? event.message : null,
    }),
    setReady: assign({
      readiness: ({ context, event }) => event.type === 'SET_READY'
        ? { ...context.readiness, [event.step]: event.ready }
        : context.readiness,
    }),
  },
  guards: {
    backgroundReady: ({ context }) => context.readiness.background,
    regionsReady: ({ context }) => context.readiness.regions,
    partsReady: ({ context }) => context.readiness.parts,
  },
}).createMachine({
  id: 'modularSpriteWizard',
  initial: 'source',
  context: { dirty: false, error: null, readiness: { background: false, regions: false, parts: false } },
  on: {
    CHANGE: { actions: 'markDirty' },
    SET_READY: { actions: 'setReady' },
  },
  states: {
    source: { on: { SOURCE_SELECTED: { target: 'decoding', actions: 'markDirty' } } },
    decoding: {
      on: {
        DECODED: { target: 'background', actions: 'clearError' },
        FAIL: { target: 'failure', actions: 'setError' },
      },
    },
    background: { on: { NEXT: { target: 'regions', guard: 'backgroundReady' }, BACK: 'source', FAIL: { target: 'failure', actions: 'setError' } } },
    regions: { on: { NEXT: { target: 'parts', guard: 'regionsReady' }, BACK: 'background', FAIL: { target: 'failure', actions: 'setError' } } },
    parts: { on: { NEXT: { target: 'review', guard: 'partsReady' }, BACK: 'regions' } },
    review: { on: { BACK: 'parts', FINALIZE: 'finalizing' } },
    finalizing: {
      on: {
        SUCCESS: 'success',
        FAIL: { target: 'failure', actions: 'setError' },
      },
    },
    success: { type: 'final' },
    failure: { on: { RETRY: { target: 'review', actions: 'clearError' } } },
  },
});
