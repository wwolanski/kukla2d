import { useTextureInspectorController } from "@/features/inspector/application/useNodeInspectorController.js";
import { SectionTitle } from "@/features/inspector/components/fields/InspectorRow.jsx";

import { Button } from "@/components/ui/button";

export function TexturePanel({ node }) {
  const { exportTexture: handleExport } = useTextureInspectorController(node);
  if (!node || node.type !== "part") return null;

  return (
    <div className="space-y-2">
      <SectionTitle help="Source image for this part. Use Replace textures in the Bones tab to swap one or many Library assets safely.">
        Texture
      </SectionTitle>
      <div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          onClick={handleExport}
        >
          Export Texture
        </Button>
      </div>
    </div>
  );
}
