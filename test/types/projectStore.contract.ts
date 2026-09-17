import { projectSelectors } from "@/store/project/projectStoreTypes.js";
import type {
  ProjectActions,
  ProjectCommandResult,
  ProjectStore,
  ProjectVersionControl,
} from "@/store/project/projectStoreTypes.types.js";

declare const store: ProjectStore;

type ProjectState = Pick<
  ProjectStore,
  "project" | "versionControl" | "hasUnsavedChanges"
>;
type ProjectOperationResult = ReturnType<
  ProjectActions["createIdleBreathingMotion"]
>;
type ProjectCommandErrorCode = NonNullable<
  Extract<ProjectOperationResult, { changed: false }>["errorCode"]
>;

const state: ProjectState = store;
const actions: ProjectActions = store;
const versions: ProjectVersionControl = projectSelectors.versionControl(store);
const commandResult: ProjectCommandResult = { changed: false, affectedIds: [] };
const errorCode: ProjectCommandErrorCode = "not-found";
const operationResult: ProjectOperationResult = {
  changed: false,
  error: "Missing target",
  errorCode,
};

projectSelectors.project(store);
projectSelectors.nodes(store);
projectSelectors.animations(store);
void [state, actions, versions, commandResult, operationResult];
