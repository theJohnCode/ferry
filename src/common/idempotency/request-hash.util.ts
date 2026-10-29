import { createHash } from 'crypto';

/**
 * Hashes a request body deterministically, so an idempotency key replayed
 * with a different body is detectable regardless of JSON key order.
 */
export function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(canonicalize(body)).digest('hex');
}

export function canonicalize(body: unknown): string {
  return JSON.stringify(sortKeys(body));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return value;
}
