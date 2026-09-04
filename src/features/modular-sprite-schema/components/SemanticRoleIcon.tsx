import { cn } from '@/lib/utils';

import { semanticRoleIcon } from './semanticRoleIcons.js';

interface SemanticRoleIconProps {
  role?: string;
  className?: string;
}

export function SemanticRoleIcon({ role, className }: SemanticRoleIconProps): React.ReactElement {
  const icon = semanticRoleIcon(role);
  return (
    <svg
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      className={cn('h-3.5 w-3.5 shrink-0', className)}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
