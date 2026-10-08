import PQueue from 'p-queue';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { AppError } from '../utils/errors.js';

// Free tier = 5 requests/min per model, so every Gemini call goes through one rate-limited queue
const queue = new PQueue({ concurrency: 2, intervalCap: config.GEMINI_RPM, interval: 60_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = 'https://generativelanguage.googleapis.com/v1beta';
const BUSY_COOLDOWN_MS = 3 * 60_000;       // overloaded / out of quota: skip that model for 3 min
const RETIRED_COOLDOWN_MS = 24 * 3600_000; // 404 retired model: skip for a day
const ALL_BUSY_PAUSE_MS = 2 * 60_000;      // every model busy: CLIP-only for 2 min, then try again

let current = config.GEMINI_MODEL;
let candidates = null;
const benched = new Map(); // model -> benched until (timestamp)
let keyRejected = null;    // only a rejected key switches the vision model off for good
let pausedUntil = 0;

const isBenched = (m) => (benched.get(m) || 0) > Date.now();
export const geminiEnabled = () => Boolean(config.GEMINI_API_KEY) && !keyRejected && Date.now() >= pausedUntil;
export function geminiStatus() {
  if (!config.GEMINI_API_KEY) return { ok: false, reason: 'GEMINI_API_KEY is not set' };
  if (keyRejected) return { ok: false, reason: keyRejected };
  if (Date.now() < pausedUntil) return { ok: false, reason: `All Gemini models are busy or over the free quota - retrying automatically at ${new Date(pausedUntil).toLocaleTimeString()}` };
  return { ok: true, model: current };
}

/** Ask Google which models this key can use; order: configured model, then Flash, Flash-Lite, Pro (newest first) */
export async function listModels() {
  if (candidates) return candidates;
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': config.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const rank = (n) => (n === config.GEMINI_MODEL ? -1 : /flash-lite/.test(n) ? 1 : /flash/.test(n) ? 0 : 2);
    candidates = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini/.test(n) && !/(image|tts|audio|live|embedding|computer|robotics|veo|imagen|learnlm|transcribe|banana|omni|customtools|nano)/.test(n))
      .sort((a, b) => rank(a) - rank(b) || ver(b) - ver(a) || a.length - b.length);
  } catch {
    candidates = [];
  }
  return candidates;
}

async function benchAndSwitch(reason, ms) {
  benched.set(current, Date.now() + ms);
  const next = (await listModels()).find((m) => !isBenched(m));
  if (next) {
    logger.warn({ from: current, to: next, reason }, 'switching vision model');
    current = next;
    return true;
  }
  pausedUntil = Date.now() + ALL_BUSY_PAUSE_MS;
  current = config.GEMINI_MODEL;
  logger.warn({ reason, resumeAt: new Date(pausedUntil).toISOString() }, 'all vision models busy - CLIP-only scoring for now');
  return false;
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
 * deadline: give up (caller falls back to CLIP) once this timestamp passes
 */
export async function geminiJson({ parts, schema, temperature = 0.2, deadline = Infinity }) {
  if (!geminiEnabled()) throw new AppError('BRAIN_DISABLED', geminiStatus().reason, 503);
  const contents = [{
    role: 'user',
    parts: parts.map((p) => (p.image ? { inlineData: { mimeType: 'image/jpeg', data: p.image.toString('base64') } } : { text: p.text })),
  }];
  let body = { contents, generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema } };

  return queue.add(async () => {
    let attempt = 0;
    for (let guard = 0; guard < 16; guard++) {
      if (!geminiEnabled()) throw new AppError('BRAIN_DISABLED', geminiStatus().reason, 503);
      if (Date.now() > deadline) throw new AppError('BRAIN_SKIPPED', 'Vision check time budget used up', 503);
      attempt++;
      const res = await call(body);
      if (res.ok) {
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').replace(/^```(json)?|```$/g, '').trim();
        try { return JSON.parse(text); } catch { throw new AppError('BRAIN_BAD_OUTPUT', 'Vision model returned invalid JSON', 502); }
      }
      let detail = '';
      try { detail = res.json ? JSON.stringify(await res.json()).slice(0, 300) : String(res.err?.cause || res.err); } catch { /* ignore */ }

      if (res.status === 400 && body.generationConfig.responseSchema) {
        logger.warn({ model: current }, 'model rejected responseSchema, retrying with schema in prompt');
        body = { contents: [{ ...contents[0], parts: [...contents[0].parts, { text: `Reply ONLY with JSON matching this schema: ${JSON.stringify(schema)}` }] }], generationConfig: { temperature, responseMimeType: 'application/json' } };
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        keyRejected = 'Gemini API key was rejected - check GEMINI_API_KEY';
        logger.error({ status: res.status, detail }, keyRejected);
        throw new AppError('BRAIN_DISABLED', keyRejected, 503);
      }
      if (res.status === 404) {
        if (await benchAndSwitch('model retired (404)', RETIRED_COOLDOWN_MS)) { attempt = 0; continue; }
        throw new AppError('BRAIN_UNAVAILABLE', geminiStatus().reason, 503);
      }
      const busy = [0, 429, 500, 502, 503, 504].includes(res.status);
      if (busy && (attempt >= 3 || (res.status === 429 && attempt >= 2))) {
        if (await benchAndSwitch(`HTTP ${res.status}`, BUSY_COOLDOWN_MS)) { attempt = 0; continue; }
        throw new AppError('BRAIN_UNAVAILABLE', geminiStatus().reason, 503);
      }
      if (!busy) {
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
