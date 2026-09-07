import { animationSelectors } from "@/store/animationStoreTypes.js";
import { useAnimationStore } from "@/store/animationStore";
import type {
  AnimationState,
  AnimationStore,
  DraftPoseValue,
} from "@/store/animationStoreTypes.types.js";
import { readEditorState, useEditorStore } from "@/store/editorStore";
import { editorSelectors } from "@/store/editorStoreTypes.js";
import type {
  EditorActions,
  EditorStore,
} from "@/store/editorStoreTypes.types.js";

type AnimationActions = Omit<AnimationStore, keyof AnimationState>;

const animationStore: AnimationStore = useAnimationStore.getState();
const animationState: AnimationState = animationStore;
const animationActions: AnimationActions = animationStore;
const draftValue: DraftPoseValue = { x: 12, mesh_verts: [{ x: 0, y: 0 }] };

animationSelectors.activeAnimationId(animationStore);
animationSelectors.transport(animationStore);
animationSelectors.hasPendingDraft(animationStore);

const editorStore: EditorStore = readEditorState();
type EditorState = Omit<EditorStore, keyof EditorActions>;
type EditorInteraction = EditorStore["interaction"];
const editorState: EditorState = useEditorStore.getState();
const editorActions: EditorActions = editorStore;
const interaction: EditorInteraction = {
  kind: "pendingPickAutoMotionPoint",
  role: "cheekArea",
  targetNodeId: null,
};

editorSelectors.selection(editorStore);
editorSelectors.interaction(editorStore);
editorSelectors.view(editorStore);
void [
  animationState,
  animationActions,
  draftValue,
  editorState,
  editorActions,
  interaction,
];
