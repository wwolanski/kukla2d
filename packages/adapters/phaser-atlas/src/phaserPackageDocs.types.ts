export interface BakeReportEntry {
  classification: "baked" | "dropped" | "blocked" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface BakeReport {
  format: "phaser-atlas-baked";
  version: "1";
  options: {
    fps: number;
    scale: number;
    trim: boolean;
    padding: number;
    maxPageSize: number;
    loop: boolean;
    repeat: number;
    destination: string;
  };
  summary: {
    pages: number;
    totalFrames: number;
    totalAnimations: number;
    totalMarkers: number;
  };
  issues: BakeReportEntry[];
}

export interface BakeReportInput {
  fps: number;
  scale: number;
  trim: boolean;
  padding: number;
  maxPageSize: number;
  loop: boolean;
  repeat: number;
  destination: string;
  pageCount: number;
  totalFrames: number;
  animationCount: number;
  markerCount: number;
  issues?: BakeReportEntry[];
}

export interface ExampleInput {
  textureKey: string;
  atlasFileNames: string[];
  atlasJsonFileName: string;
  animationsJsonFileName: string;
  animationKeys: string[];
  isMulti: boolean;
  rootFolder: string;
}

export interface ReadmeInput {
  textureKey: string;
  animationKeys: string[];
  isMulti: boolean;
  pageCount: number;
  markerCount: number;
  pageFileNames: string[];
}
