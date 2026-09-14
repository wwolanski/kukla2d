import { createActorContext } from "@xstate/react";

import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import { editorWorkflowMachine } from "@/features/canvas/application/editorWorkflowMachine.js";
import { executeCommandBatch } from "@/features/canvas/application/workflowCommandRuntime.js";
import { resolveEditorCommands } from "@/features/canvas/domain/resolveEditorCommands.js";

const editorWorkflowLogic = editorWorkflowMachine.provide({
  actions: {
    emitCommands: ({ context, event }) => {
      const commands = resolveEditorCommands({ event, context });
      if (commands.length === 0) return;
      executeCommandBatch(commands, {
        editorStore: useEditorStore,
        projectStore: useProjectStore,
        pixiRuntime: null,
        editorMode: useEditorStore.getState().editorMode,
      });
    },
  },
});

export const EditorWorkflowContext = createActorContext(editorWorkflowLogic);
