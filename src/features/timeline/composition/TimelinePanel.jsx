import { TimelinePanelView } from "../components/TimelinePanel.jsx";
import { decodeAudioFile } from "../infrastructure/audioDecode.js";

export function TimelinePanel() {
  return <TimelinePanelView decodeAudioFile={decodeAudioFile} />;
}
