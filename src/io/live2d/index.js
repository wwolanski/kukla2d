/**
 * Live2D Cubism export — main entry point.
 *
 * Converts a Kukla2d project into a set of Live2D Cubism files:
 *   - *.model3.json  (manifest)
 *   - *.moc3          (binary model)
 *   - *.cdi3.json     (display info — human-readable names)
 *   - *.motion3.json  (animation curves)
 *   - texture atlas PNGs
 *
 * @module io/live2d
 */

export { generateModel3Json } from "@/io/live2d/model3json.js";
export { generateCdi3Json } from "@/io/live2d/cdi3json.js";
export { generateMotion3Json } from "@/io/live2d/motion3json.js";
export { generateMoc3 } from "@/io/live2d/moc3writer.js";
export { packTextureAtlas } from "@/io/live2d/textureAtlas.js";
export { exportLive2D, exportLive2DProject } from "@/io/live2d/exporter.js";
