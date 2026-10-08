import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** Runs a search: POST, then follows the SSE progress stream and loads results as they arrive */
export function useSearch({ onFinished }) {
  const [state, setState] = useState({ id: null, running: false, stages: {}, live: {}, product: null, data: null, error: null });
  const esRef = useRef(null);
  const refreshTimer = useRef(null);

  const load = useCallback(async (id) => {
    try {
      const data = await api.getSearch(id);
      setState((s) => (s.id === id ? { ...s, data, product: data.product || s.product } : s));
      return data;
    } catch (err) {
      setState((s) => ({ ...s, error: { message: err.message, hint: err.hint } }));
      return null;
    }
  }, []);

  const scheduleRefresh = useCallback((id) => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; load(id); }, 700);
  }, [load]);

  const follow = useCallback((id) => {
    esRef.current?.close();
    const es = new EventSource(api.streamUrl(id));
    esRef.current = es;
    const on = (type, fn) => es.addEventListener(type, (e) => {
      let data = {};
      try { data = e.data ? JSON.parse(e.data) : {}; } catch { /* ignore */ }
      fn(data, e);
    });
    const finish = async (error) => {
      es.close();
      const data = await load(id);
      setState((s) => (s.id === id ? { ...s, running: false, error: error || (data?.status === 'failed' ? { message: data.error || 'The search failed.' } : s.error) } : s));
      onFinished?.();
    };
    on('stage', (d) => setState((s) => ({ ...s, stages: { ...s.stages, [d.stage]: d } })));
    on('product', (d) => setState((s) => ({ ...s, product: d })));
    on('source', (d) => setState((s) => ({ ...s, live: { ...s.live, [d.source]: { ...s.live[d.source], ...d } } })));
    on('results', () => scheduleRefresh(id));
    on('done', () => finish());
    // "error" is both our server event (has data) and the browser's connection error (no data)
    on('error', (d, e) => {
      if (e.data) finish({ message: d.message || 'The search failed.', hint: d.hint });
      else if (es.readyState === EventSource.CLOSED) finish();
    });
  }, [load, onFinished, scheduleRefresh]);

  const start = useCallback(async (payload) => {
    esRef.current?.close();
    setState({ id: null, running: true, stages: {}, live: {}, product: null, data: null, error: null, payload });
    try {
      const { id } = await api.search(payload);
      setState((s) => ({ ...s, id }));
      follow(id);
    } catch (err) {
      setState((s) => ({ ...s, running: false, error: { message: err.message, hint: err.hint } }));
    }
  }, [follow]);

  const open = useCallback(async (id) => {
    esRef.current?.close();
    setState({ id, running: false, stages: {}, live: {}, product: null, data: null, error: null });
    const data = await load(id);
    if (data && (data.status === 'running' || data.status === 'queued')) {
      setState((s) => ({ ...s, running: true }));
      follow(id);
    }
  }, [follow, load]);

  useEffect(() => () => esRef.current?.close(), []);
  return { ...state, start, open };
}
