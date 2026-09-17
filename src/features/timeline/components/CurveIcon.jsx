import { cn } from '@/lib/utils.js';

export function CurveIcon({ type, className = '' }) {
  let pathD;
  if (type === 'linear') pathD = 'M 2 14 L 14 2';
  else if (type === 'ease-in') pathD = 'M 2 14 C 14 14, 14 14, 14 2';
  else if (type === 'ease-out') pathD = 'M 2 14 C 2 2, 2 2, 14 2';
  else if (type === 'stepped') pathD = 'M 2 14 L 14 14 L 14 2';
  else pathD = 'M 2 14 C 8 14, 8 2, 14 2'; // ease-both / ease

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className={cn('stroke-current fill-none', className)}>
      <path d={pathD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
