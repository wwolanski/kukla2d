import { encodePhaserAtlasPackage } from "@kukla2d/adapter-phaser-atlas";

import { resolveExportEncoder } from "../application/resolveExportEncoder.js";
import { ExportModal as ExportModalView } from "../components/ExportModal.jsx";
import { browserExportSink } from "../infrastructure/browserExportSink.js";
import { encodeGif } from "../infrastructure/encodeGif.js";
import { encodePngSequence } from "../infrastructure/encodePngSequence.js";
import { encodePngSpritesheet } from "../infrastructure/encodePngSpritesheet.js";

const ENCODERS = {
  gif: encodeGif,
  png_sequence: encodePngSequence,
  png_spritesheet: encodePngSpritesheet,
};

export function ExportModal(props) {
  return (
    <ExportModalView
      {...props}
      phaserAtlasAdapter={encodePhaserAtlasPackage}
      resolveEncoder={(variantId) => resolveExportEncoder(variantId, ENCODERS)}
      writeArtifacts={browserExportSink}
    />
  );
}
