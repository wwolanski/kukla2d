import { TimelinePanelView } from "@/features/timeline/components/TimelinePanel.jsx";
import { decodeAudioFile } from "@/features/timeline/infrastructure/audioDecode.js";

export function TimelinePanel() {
  return <TimelinePanelView decodeAudioFile={decodeAudioFile} />;
}
