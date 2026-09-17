import { useEffect, useRef } from 'react';

import { MAX_NAME_LENGTH } from '@/domain/nameConstraints.js';

export function InlineRenameInput({ value, onChange, onBlur, onKeyDown, className }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      maxLength={MAX_NAME_LENGTH}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={className ?? 'min-w-0 flex-1 bg-transparent border border-primary/40 rounded px-1 py-0 text-xs font-mono outline-none'}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
