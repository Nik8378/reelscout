import { collectorEnv as env } from './env.js';
import { cache } from '../db.js';
import { sha1 } from '../services/imageStore.js';
import { logger } from '../logger.js';

export class SourceError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Runs an Apify actor synchronously and returns its dataset items.
 * Raw responses are cached (RAW_CACHE_HOURS) so re-running a query during dev/demo costs no credits.
 */
export async function runActor(actorId, input, { timeoutSec = 110, maxItems } = {}) {
  if (!env.APIFY_TOKEN) throw new SourceError('NO_TOKEN', 'APIFY_TOKEN is not set');
  const key = `raw:apify:${actorId}:${sha1(JSON.stringify(input))}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const url = new URL(`https://api.apify.com/v2/acts/${actorId.replace('/', '~')}/run-sync-get-dataset-items`);
  url.searchParams.set('timeout', String(timeoutSec));
  if (maxItems) url.searchParams.set('maxItems', String(maxItems));
  const started = Date.now();
  const send = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.APIFY_TOKEN}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSec + 20) * 1000),
    });
  const res = await send()
    .catch(() => new Promise((r) => setTimeout(r, 2000)).then(send))
    .catch((err) => {
      throw new SourceError('NETWORK', `Apify unreachable: ${err.cause?.code || err.message}`, true);
    });

  if (res.status === 401) throw new SourceError('AUTH', 'Apify token is invalid');
  if (res.status === 402 || res.status === 403)
    throw new SourceError('NO_CREDIT', `Apify refused the request (HTTP ${res.status}) - free monthly credit used up`);
  if (res.status === 404) throw new SourceError('NO_ACTOR', `Apify actor ${actorId} not found`);
  if (res.status === 429) throw new SourceError('RATE_LIMIT', 'Apify rate limit hit', true);
  if (!res.ok && res.status !== 408)
    throw new SourceError('UPSTREAM', `Apify ${actorId} failed (HTTP ${res.status})`, res.status >= 500);

  const items = await res.json().catch(() => []);
  const list = Array.isArray(items) ? items : [];
  logger.info({ actorId, items: list.length, ms: Date.now() - started }, 'apify run finished');
  if (list.length) cache.set(key, list, env.RAW_CACHE_MS);
  return list;
}
