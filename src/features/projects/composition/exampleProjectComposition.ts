import { loadExampleProjectFile as loadExampleProjectFileAdapter } from "@/features/projects/infrastructure/exampleProject.js";

export function loadExampleProjectFile(): Promise<File> {
  return loadExampleProjectFileAdapter();
}
