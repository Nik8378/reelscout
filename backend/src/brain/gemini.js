import PQueue from 'p-queue';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { AppError } from '../utils/errors.js';

// Free tier is limited per minute, so every Gemini call goes through one rate-limited queue
const queue = new PQueue({ concurrency: 2, intervalCap: config.GEMINI_RPM, interval: 60_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = 'https://generativelanguage.googleapis.com/v1beta';

let current = config.GEMINI_MODEL;
let candidates = null;
const exhausted = new Set();
let disabledReason = null; // circuit breaker: bad key / no usable model -> stop calling, CLIP carries on

export const geminiEnabled = () => Boolean(config.GEMINI_API_KEY) && !disabledReason;
export const geminiStatus = () => (disabledReason ? { ok: false, reason: disabledReason } : { ok: Boolean(config.GEMINI_API_KEY), model: current });

/** Ask Google which models this key can use; order: Flash, Flash-Lite, Pro - newest version first */
export async function listModels() {
  if (candidates) return candidates;
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': config.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const rank = (n) => (/flash-lite/.test(n) ? 1 : /flash/.test(n) ? 0 : 2);
    candidates = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini/.test(n) && !/(image|tts|audio|live|embedding|computer|robotics|veo|imagen|learnlm)/.test(n))
      .sort((a, b) => rank(a) - rank(b) || ver(b) - ver(a) || a.length - b.length);
  } catch {
    candidates = [];
  }
  return candidates;
}

async function switchModel(reason) {
  exhausted.add(current);
  const next = (await listModels()).find((m) => !exhausted.has(m));
  if (!next || exhausted.size >= 4) return false;
  logger.warn({ from: current, to: next, reason }, 'switching vision model');
  current = next;
  return true;
}

function call(body) {
  return fetch(`${API}/models/${current}:generateContent`, {
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
    let attempt = 0;
    for (let guard = 0; guard < 14; guard++) {
      if (disabledReason) throw new AppError('BRAIN_DISABLED', disabledReason, 503);
      attempt++;
      const res = await call(body);
      if (res.ok) {
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').replace(/^```(json)?|```$/g, '').trim();
        try { return JSON.parse(text); } catch { throw new AppError('BRAIN_BAD_OUTPUT', 'Vision model returned invalid JSON', 502); }
      }
      let detail = '';
      try { detail = res.json ? JSON.stringify(await res.json()).slice(0, 400) : String(res.err?.cause || res.err); } catch { /* ignore */ }

      if (res.status === 400 && body.generationConfig.responseSchema) {
        logger.warn({ model: current, detail }, 'model rejected responseSchema, retrying with schema in prompt');
        body = { contents: [{ ...contents[0], parts: [...contents[0].parts, { text: `Reply ONLY with JSON matching this schema: ${JSON.stringify(schema)}` }] }], generationConfig: { temperature, responseMimeType: 'application/json' } };
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        disabledReason = 'Gemini API key was rejected';
        logger.error({ status: res.status, detail }, disabledReason);
        throw new AppError('BRAIN_DISABLED', disabledReason, 503);
      }
      // retired model, or overloaded / out of quota for too long -> move to the next available model
      const overloaded = [0, 429, 500, 502, 503, 504].includes(res.status);
      if (res.status === 404 || (overloaded && attempt >= 3)) {
        if (await switchModel(`HTTP ${res.status}`)) { attempt = 0; continue; }
        if (res.status === 404) disabledReason = `No available Gemini model (last tried "${current}")`;
        logger.error({ status: res.status, detail }, 'gemini call failed');
        throw new AppError('BRAIN_UNAVAILABLE', `Vision model unavailable (HTTP ${res.status})`, 502);
      }
      if (!overloaded) {
        logger.error({ status: res.status, detail }, 'gemini call failed');
        throw new AppError('BRAIN_UNAVAILABLE', `Vision model error (HTTP ${res.status})`, 502);
      }
      const m = detail.match(/"retryDelay":"(\d+)s"/);
      const wait = Math.min(m ? Number(m[1]) * 1000 : 2500 * 2 ** (attempt - 1), 20_000);
      logger.warn({ model: current, status: res.status, attempt, wait }, 'gemini retry');
      await sleep(wait);
    }
    throw new AppError('BRAIN_UNAVAILABLE', 'Vision model unavailable', 502);
  });
}
