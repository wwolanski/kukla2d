import { useCallback, useRef, useState } from "react";

import { validateRenameValue } from "../domain/inlineRename.js";

import type {
  Dispatch,
  KeyboardEventHandler,
  RefObject,
  SetStateAction,
} from "react";

interface InlineRenameOptions {
  currentName: string | null | undefined;
  onRename: (name: string) => void;
}

interface InlineRenameController {
  isEditing: boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  startEdit: () => void;
  commit: () => void;
  cancel: () => void;
  handleKeyDown: KeyboardEventHandler<HTMLInputElement>;
  handleBlur: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function useInlineRename({
  currentName,
  onRename,
}: InlineRenameOptions): InlineRenameController {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startEdit = useCallback(() => {
    setDraft(currentName ?? "");
    setIsEditing(true);
  }, [currentName]);

  const commit = useCallback(() => {
    const valid = validateRenameValue(draft);
    if (valid && valid !== currentName) {
      onRename(valid);
    }
    setIsEditing(false);
  }, [draft, currentName, onRename]);

  const cancel = useCallback(() => {
    setIsEditing(false);
    setDraft(currentName ?? "");
  }, [currentName]);

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel],
  );

  const handleBlur = useCallback(() => {
    commit();
  }, [commit]);

  return {
    isEditing,
    draft,
    setDraft,
    startEdit,
    commit,
    cancel,
    handleKeyDown,
    handleBlur,
    inputRef,
  };
}
