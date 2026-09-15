export async function loadTimelinePanel(): Promise<{ default: React.ComponentType<unknown> }> {
  const module = await import('@/features/timeline/index.js');
  return { default: module.TimelinePanel };
}

export async function loadAnimationListPanel(): Promise<{ default: React.ComponentType<unknown> }> {
  const module = await import('@/features/timeline/index.js');
  return { default: module.AnimationListPanel };
}
