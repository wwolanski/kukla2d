import { loadExampleProjectFile as loadExampleProjectFileAdapter } from "../infrastructure/exampleProject.js";

export function loadExampleProjectFile(): Promise<File> {
  return loadExampleProjectFileAdapter();
}
