import PQueue from 'p-queue';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { AppError } from '../utils/errors.js';

// Free tier is limited per minute, so every Gemini call goes through one rate-limited queue
const queue = new PQueue({ concurrency: 2, intervalCap: config.GEMINI_RPM, interval: 60_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const geminiEnabled = () => Boolean(config.GEMINI_API_KEY);

/**
 * parts: [{ text }] or [{ image: Buffer }]
 * schema: Gemini responseSchema (OpenAPI subset) - forces valid JSON back
 */
export async function geminiJson({ parts, schema, temperature = 0.2 }) {
  if (!geminiEnabled()) throw new AppError('BRAIN_DISABLED', 'GEMINI_API_KEY is not set', 503);
  const body = {
    contents: [{
      role: 'user',
      parts: parts.map((p) => (p.image ? { inlineData: { mimeType: 'image/jpeg', data: p.image.toString('base64') } } : { text: p.text })),
    }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`;

  return queue.add(async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      }).catch((err) => ({ ok: false, status: 0, err }));

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        try { return JSON.parse(text); } catch { throw new AppError('BRAIN_BAD_OUTPUT', 'Vision model returned invalid JSON', 502); }
      }
      const retryable = [0, 429, 500, 502, 503, 504].includes(res.status);
      let detail = '';
      try { detail = res.json ? JSON.stringify(await res.json()).slice(0, 400) : String(res.err); } catch { /* ignore */ }
      if (!retryable || attempt === 4) {
        logger.error({ status: res.status, detail }, 'gemini call failed');
        throw new AppError('BRAIN_UNAVAILABLE', `Vision model error (HTTP ${res.status})`, 502);
      }
      const m = detail.match(/"retryDelay":"(\d+)s"/);
      const wait = m ? Number(m[1]) * 1000 : 2000 * 2 ** attempt;
      logger.warn({ status: res.status, attempt, wait }, 'gemini retry');
      await sleep(Math.min(wait, 45_000));
    }
    return null;
  });
}
