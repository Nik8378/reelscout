import PQueue from 'p-queue';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { AppError } from '../utils/errors.js';

// Free tier is limited per minute, so every Gemini call goes through one rate-limited queue
const queue = new PQueue({ concurrency: 2, intervalCap: config.GEMINI_RPM, interval: 60_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Circuit breaker: a bad key or retired model fails every call, so stop calling and fall back to CLIP
let disabledReason = null;
export const geminiEnabled = () => Boolean(config.GEMINI_API_KEY) && !disabledReason;
export const geminiStatus = () => (disabledReason ? { ok: false, reason: disabledReason } : { ok: Boolean(config.GEMINI_API_KEY), model: config.GEMINI_MODEL });

async function call(body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`;
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  }).catch((err) => ({ ok: false, status: 0, err }));
}

/**
 * parts: [{ text }] or [{ image: Buffer }]
 * schema: Gemini responseSchema (OpenAPI subset) - forces valid JSON back
 */
export async function geminiJson({ parts, schema, temperature = 0.2 }) {
  if (!geminiEnabled()) throw new AppError('BRAIN_DISABLED', disabledReason || 'GEMINI_API_KEY is not set', 503);
  const contents = [{
    role: 'user',
    parts: parts.map((p) => (p.image ? { inlineData: { mimeType: 'image/jpeg', data: p.image.toString('base64') } } : { text: p.text })),
  }];
  let body = { contents, generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema } };

  return queue.add(async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (disabledReason) throw new AppError('BRAIN_DISABLED', disabledReason, 503);
      const res = await call(body);
      if (res.ok) {
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').replace(/^```(json)?|```$/g, '').trim();
        try { return JSON.parse(text); } catch { throw new AppError('BRAIN_BAD_OUTPUT', 'Vision model returned invalid JSON', 502); }
      }
      let detail = '';
      try { detail = res.json ? JSON.stringify(await res.json()).slice(0, 500) : String(res.err?.cause || res.err); } catch { /* ignore */ }

      // 400 = request shape not accepted by this model: retry once with the schema in the prompt instead
      if (res.status === 400 && body.generationConfig.responseSchema) {
        logger.warn({ detail }, 'gemini rejected responseSchema, retrying with schema in prompt');
        body = { contents: [{ ...contents[0], parts: [...contents[0].parts, { text: `Reply ONLY with JSON matching this schema: ${JSON.stringify(schema)}` }] }], generationConfig: { temperature, responseMimeType: 'application/json' } };
        continue;
      }
      if ([401, 403, 404].includes(res.status)) {
        disabledReason = res.status === 404
          ? `Gemini model "${config.GEMINI_MODEL}" is not available - set GEMINI_MODEL in .env`
          : 'Gemini API key was rejected';
        logger.error({ status: res.status, detail }, `vision model disabled: ${disabledReason}`);
        throw new AppError('BRAIN_DISABLED', disabledReason, 503);
      }
      const retryable = [0, 429, 500, 502, 503, 504].includes(res.status);
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
