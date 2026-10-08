import { describe, it, expect } from 'vitest';
import { isPublicIp, assertSafeUrl } from '../src/utils/ssrf.js';

describe('SSRF guard', () => {
  it('blocks private and loopback IPs', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1']) {
      expect(isPublicIp(ip)).toBe(false);
    }
    expect(isPublicIp('8.8.8.8')).toBe(true);
  });
  it('rejects bad schemes, ports and internal hosts', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertSafeUrl('http://localhost/x')).rejects.toThrow();
    await expect(assertSafeUrl('http://127.0.0.1/x')).rejects.toThrow();
    await expect(assertSafeUrl('http://example.com:8080/x')).rejects.toThrow();
  });
});
