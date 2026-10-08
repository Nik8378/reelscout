import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { AppError } from './errors.js';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);

export function isPublicIp(ip) {
  try {
    let addr = ipaddr.parse(ip);
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
    return addr.range() === 'unicast';
  } catch {
    return false;
  }
}

export async function assertSafeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('BAD_URL', 'That is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError('BAD_URL', 'Only http and https links are allowed.');
  if (url.username || url.password) throw new AppError('BAD_URL', 'Links with credentials are not allowed.');
  if (url.port && !['80', '443'].includes(url.port)) throw new AppError('BAD_URL', 'Only standard web ports are allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new AppError('UNSAFE_URL', 'Internal addresses are blocked.');
  }
  const addrs = ipaddr.isValid(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new AppError('BAD_URL', 'Could not resolve that website.');
  if (addrs.some((a) => !isPublicIp(a.address))) throw new AppError('UNSAFE_URL', 'Internal addresses are blocked.');
  return url;
}

/** fetch that re-validates every redirect hop and caps size + time */
export async function safeFetch(raw, { timeoutMs = 15000, maxBytes = 5_000_000, headers = {} } = {}) {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    await assertSafeUrl(current);
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
        ...headers,
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) throw new AppError('TOO_LARGE', 'The page is too large to process.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new AppError('TOO_LARGE', 'The page is too large to process.');
    return { status: res.status, url: current, headers: res.headers, body: buf };
  }
  throw new AppError('TOO_MANY_REDIRECTS', 'The link redirected too many times.');
}
