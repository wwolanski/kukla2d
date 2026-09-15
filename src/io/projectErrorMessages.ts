import { isRecord } from '@/lib/guards.js';

export function formatProjectError(error: unknown): string {
  if (!error) return 'Unknown project error.';

  const lines: string[] = [];
  const message = isRecord(error) && typeof error.message === 'string'
    ? error.message
    : /* eslint-disable-next-line @typescript-eslint/no-base-to-string -- fallback for non-Error throwables */
      String(error);
  if (message) lines.push(message);

  if (isRecord(error) && Array.isArray(error.errors)) {
    for (const nested of error.errors) {
      if (!nested) continue;
      const asset = isRecord(nested)
        && typeof nested.assetType === 'string'
        && typeof nested.assetId === 'string'
        ? `${nested.assetType} "${nested.assetId}"`
        : null;
      const nestedMessage = isRecord(nested) && typeof nested.message === 'string'
        ? nested.message
        : String(nested);
      lines.push(asset ? `${asset}: ${nestedMessage}` : nestedMessage);
    }
  }

  if (isRecord(error)) {
    const cause = error.cause;
    if (isRecord(cause) && typeof cause.message === 'string' && cause.message !== message) {
      lines.push(`Cause: ${cause.message}`);
    }
  }

  return [...new Set(lines)].join('\n');
}
