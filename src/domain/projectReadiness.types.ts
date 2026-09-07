export type ProjectReadinessTarget =
  "stretch" | "frames" | "spine" | "live2d" | "live2d_project" | "phaser_atlas";

export interface ProjectReadinessIssue {
  code: string;
  path: string;
  message: string;
  classification?: "baked" | "dropped";
}

export interface ProjectReadinessReport {
  errors: ProjectReadinessIssue[];
  warnings: ProjectReadinessIssue[];
}
