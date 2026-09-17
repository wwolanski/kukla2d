import { LayerPanelView } from "@/features/layers/components/LayerPanel.jsx";
import { getTransparentDragImage } from "@/features/layers/infrastructure/dragImageAdapter.js";

export function LayerPanel(props) {
  return <LayerPanelView {...props} getDragImage={getTransparentDragImage} />;
}
