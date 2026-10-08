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
  const [navOpen, setNavOpen] = useState(false);

  const refreshHistory = useCallback(
    () =>
      api
        .history()
        .then(setHistory)
        .catch(() => {}),
    [],
  );
  const refreshHealth = useCallback(
    () =>
      api
        .health()
        .then(setHealth)
        .catch(() => setHealth(null)),
    [],
  );
  const search = useSearch({
    onFinished: () => {
      refreshHistory();
      refreshHealth();
    },
  });

  useEffect(() => {
    refreshHealth();
    refreshHistory();
    api
      .shortlist()
      .then((l) => setShortlist(new Set(l.map((v) => v.id))))
      .catch(() => {});
    const t = setInterval(refreshHealth, 30000);
    return () => clearInterval(t);
  }, [refreshHealth, refreshHistory]);

  useEffect(() => {
    if (search.running) refreshHistory();
  }, [search.id, search.running, refreshHistory]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleShort = async (v) => {
    const has = shortlist.has(v.id);
    const next = new Set(shortlist);
    if (has) next.delete(v.id);
    else next.add(v.id);
    setShortlist(next);
    try {
      if (has) await api.removeShortlist(v.id);
      else await api.addShortlist(v.id, search.id);
    } catch {
      setShortlist(shortlist);
    }
  };

  const openSearch = (id) => {
    setNavOpen(false);
    search.open(id);
  };
  const min = health?.minPerSource || 20;
  const product = search.product || search.data?.product;
  const started = search.running || search.data || search.error;
  const tiktokOn = search.payload?.options?.tiktok ?? search.data?.options?.tiktok ?? Boolean(search.data?.sources?.tiktok);
  const failed = search.data?.status === 'failed' || search.error;
  const newVideos = (search.data?.videos || []).filter((v) => v.status === 'shown').length;

  return (
    <div className="app">
      <Sidebar
        history={history}
        activeId={search.id}
        onOpen={openSearch}
        shortlistCount={shortlist.size}
        health={health}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <div className="main-col">
        <SearchBar onSearch={search.start} running={search.running} health={health} onMenu={() => setNavOpen(true)} />
        <main className="content">
          {!health && (
            <div className="notice error" role="alert">
              <b>Backend not reachable.</b> Start it with <code>cd backend && npm run dev</code>, then refresh.
            </div>
          )}
          {!started && <Welcome onExample={(q) => search.start({ q, options: { tiktok: health?.tiktokDefault ?? true } })} />}
          {started && (
            <>
              <div className="page-head">
                <div>
                  <span className="muted sm">
                    {search.data?.createdAt ? new Date(search.data.createdAt).toLocaleString() : 'New search'}
                    {search.data?.sources?.ms ? ` · ${Math.round(search.data.sources.ms / 1000)}s` : ''}
                  </span>
                  <h1>{product?.title || search.data?.input || search.payload?.q || 'Searching…'}</h1>
                </div>
                <div className="head-actions">
                  <span className={`status-pill ${search.running ? 'run' : failed ? 'bad' : 'ok'}`}>
                    {search.running ? 'Running…' : failed ? 'Failed' : `Complete · ${newVideos} new videos`}
                  </span>
                  {search.id && !search.running && newVideos > 0 && (
                    <a className="btn ghost" href={`/api/search/${search.id}/export.csv`}>
                      <DownloadIcon /> Export CSV
                    </a>
                  )}
                </div>
              </div>
              {(search.running || Object.keys(search.stages).length > 0) && (
                <Pipeline stages={search.stages} live={search.live} running={search.running} tiktok={tiktokOn} />
              )}
              <Kpis data={search.data} live={search.live} min={min} />
              <ProductPanel product={product} />
              <Notices data={search.data} product={product} health={health} error={search.error} />
              <Results
                data={search.data}
                running={search.running}
                min={min}
                shortlist={shortlist}
                onToggleShort={toggleShort}
                onOpen={setSelected}
              />
            </>
          )}
        </main>
      </div>
      <Drawer
        key={selected?.id}
        v={selected}
        onClose={() => setSelected(null)}
        saved={Boolean(selected && shortlist.has(selected.id))}
        onToggleShort={() => selected && toggleShort(selected)}
      />
    </div>
  );
}
