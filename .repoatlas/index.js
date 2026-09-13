import { defineRepoExtension } from "repoatlas/extension";

import { extendConfig } from "./extension.js";
import { repositoryPolicyMessages } from "./registry/index.js";

const extension = defineRepoExtension({
  name: "kukla2d",
  registry: { repository: repositoryPolicyMessages },
  extendConfig,
});

export { extendConfig, repositoryPolicyMessages };
export default extension;
