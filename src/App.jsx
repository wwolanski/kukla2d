
import { useUndoRedo } from '@/app/hooks/useUndoRedo.js';
import { RootErrorBoundary } from '@/app/layout/components/RootErrorBoundary.jsx';
import { SmallScreenGuard } from '@/app/layout/components/SmallScreenGuard.jsx';
import EditorLayout from '@/app/layout/EditorLayout.jsx';

import { Toaster } from '@/components/ui/toaster.jsx';


function App() {
  // Mount global undo/redo keyboard handler
  useUndoRedo();

  return (
    <RootErrorBoundary>
      <EditorLayout />
      <Toaster />
      <SmallScreenGuard />
    </RootErrorBoundary>
  );
}

export default App;
