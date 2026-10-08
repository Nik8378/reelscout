import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useSearch } from './useSearch.js';
import { SearchBar, Pipeline, Kpis, ProductPanel, Notices, Results, Drawer, Sidebar, Welcome } from './components.jsx';
import { DownloadIcon } from './icons.jsx';

export default function App() {
  const [health, setHealth] = useState(null);
  const [history, setHistory] = useState([]);
  const [shortlist, setShortlist] = useState(new Set());
  const [selected, setSelected] = useState(null);

  const refreshHistory = useCallback(() => api.history().then(setHistory).catch(() => {}), []);
  const refreshHealth = useCallback(() => api.health().then(setHealth).catch(() => setHealth(null)), []);
  const search = useSearch({ onFinished: () => { refreshHistory(); refreshHealth(); } });

  useEffect(() => {
    refreshHealth();
    refreshHistory();
    api.shortlist().then((l) => setShortlist(new Set(l.map((v) => v.id)))).catch(() => {});
    const t = setInterval(refreshHealth, 30000);
    return () => clearInterval(t);
  }, [refreshHealth, refreshHistory]);

  useEffect(() => { if (search.running) refreshHistory(); }, [search.id, search.running, refreshHistory]);

  const toggleShort = async (v) => {
    const has = shortlist.has(v.id);
    const next = new Set(shortlist);
    has ? next.delete(v.id) : next.add(v.id);
    setShortlist(next);
    try { has ? await api.removeShortlist(v.id) : await api.addShortlist(v.id, search.id); } catch { setShortlist(shortlist); }
  };

  const min = health?.minPerSource || 20;
  const product = search.product || search.data?.product;
  const started = search.running || search.data || search.error;
  const tiktokOn = search.payload?.options?.tiktok ?? search.data?.options?.tiktok ?? Boolean(search.data?.sources?.tiktok);

  return (
    <div className="app">
      <Sidebar history={history} activeId={search.id} onOpen={search.open} shortlistCount={shortlist.size} health={health} />
      <div className="main-col">
        <SearchBar onSearch={search.start} running={search.running} health={health} />
        <main className="content">
          {!health && <div className="notice error" role="alert"><b>Backend not reachable.</b> Start it with <code>cd backend && npm run dev</code>, then refresh.</div>}
          {!started && <Welcome onExample={(q) => search.start({ q, options: { tiktok: health?.tiktokDefault ?? true } })} />}
          {started && (
            <>
              <div className="page-head">
                <div>
                  <span className="muted sm">{search.data?.createdAt ? new Date(search.data.createdAt).toLocaleString() : 'New search'}{search.data?.sources?.ms ? ` · ${Math.round(search.data.sources.ms / 1000)}s` : ''}</span>
                  <h1>{product?.title || search.data?.input || search.payload?.q || 'Searching…'}</h1>
                </div>
                <div className="head-actions">
                  <span className={`status-pill ${search.running ? 'run' : search.data?.status === 'failed' || search.error ? 'bad' : 'ok'}`}>
                    {search.running ? 'Running…' : search.data?.status === 'failed' || search.error ? 'Failed' : `Complete · ${(search.data?.videos || []).filter((v) => v.status === 'shown').length} videos`}
                  </span>
                  {search.id && !search.running && search.data?.videos?.length > 0 && <a className="btn ghost" href={`/api/search/${search.id}/export.csv`}><DownloadIcon /> Export CSV</a>}
                </div>
              </div>
              {(search.running || Object.keys(search.stages).length > 0) && <Pipeline stages={search.stages} live={search.live} running={search.running} tiktok={tiktokOn} />}
              <Kpis data={search.data} live={search.live} min={min} />
              <ProductPanel product={product} />
              <Notices data={search.data} product={product} health={health} error={search.error} />
              <Results data={search.data} running={search.running} min={min} shortlist={shortlist} onToggleShort={toggleShort} onOpen={setSelected} />
            </>
          )}
        </main>
      </div>
      <Drawer v={selected} onClose={() => setSelected(null)} saved={selected && shortlist.has(selected.id)} onToggleShort={() => selected && toggleShort(selected)} />
    </div>
  );
}
