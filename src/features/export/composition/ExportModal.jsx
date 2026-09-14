import { encodePhaserAtlasPackage } from "@kukla2d/adapter-phaser-atlas";

import { resolveExportEncoder } from "@/features/export/application/resolveExportEncoder.js";
import { ExportModal as ExportModalView } from "@/features/export/components/ExportModal.jsx";
import { browserExportSink } from "@/features/export/infrastructure/browserExportSink.js";
import { encodeGif } from "@/features/export/infrastructure/encodeGif.js";
import { encodePngSequence } from "@/features/export/infrastructure/encodePngSequence.js";
import { encodePngSpritesheet } from "@/features/export/infrastructure/encodePngSpritesheet.js";

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
