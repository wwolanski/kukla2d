import { LayerPanelView } from "../components/LayerPanel.jsx";
import { getTransparentDragImage } from "../infrastructure/dragImageAdapter.js";

export function LayerPanel(props) {
  return <LayerPanelView {...props} getDragImage={getTransparentDragImage} />;
}
