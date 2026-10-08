import { useMemo, useRef, useState } from 'react';
import { isUrl, fileToDataUrl, timeAgo, band, PLATFORM } from './api.js';
import { SearchIcon, UploadIcon, PlayIcon, BookmarkIcon, AlertIcon, XIcon, ExternalIcon, DownloadIcon } from './icons.jsx';

/* ---------- Search bar ---------- */
export function SearchBar({ onSearch, running, health }) {
  const [q, setQ] = useState('');
  const [image, setImage] = useState(null);
  const [tiktok, setTiktok] = useState(health?.tiktokDefault ?? true);
  const [includeSeen, setIncludeSeen] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return setErr('Use a PNG, JPEG or WebP image.');
    if (f.size > 8 * 1024 * 1024) return setErr('Image is larger than 8 MB.');
    setErr('');
    setImage({ name: f.name, dataUrl: await fileToDataUrl(f) });
  };
  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length < 2 && !image) return setErr('Type a product name, paste a product link, or add an image.');
    setErr('');
    onSearch({ q: q.trim(), image: image?.dataUrl, options: { tiktok, includeSeen } });
  };

  return (
    <form className="topbar" onSubmit={submit}>
      <label htmlFor="q" className="sr-only">Product name or product link</label>
      <div className="searchbox">
        <SearchIcon />
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name (e.g. protein dark chocolate) or paste a product link" autoComplete="off" />
        {q && <span className="pill blue">{isUrl(q) ? 'Product link' : 'Keyword'}</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
      {image ? (
        <span className="chip-img">
          <img src={image.dataUrl} alt="" />
          <span className="trunc">{image.name}</span>
          <button type="button" className="icon-btn sm" aria-label="Remove image" onClick={() => setImage(null)}><XIcon size={14} /></button>
        </span>
      ) : (
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}><UploadIcon /> Add image</button>
      )}
      <Toggle label="TikTok" on={tiktok} onChange={setTiktok} />
      <Toggle label="Include seen" on={includeSeen} onChange={setIncludeSeen} title="Allow videos returned by earlier searches (they are flagged)" />
      <button className="btn primary" disabled={running}>{running ? 'Searching…' : 'Find videos'}</button>
      {err && <div className="form-error" role="alert">{err}</div>}
    </form>
  );
}

export function Toggle({ label, on, onChange, title }) {
  return (
    <button type="button" className="toggle" aria-pressed={on} title={title} onClick={() => onChange(!on)}>
      <span className={`track ${on ? 'on' : ''}`}><span className="knob" /></span>{label}
    </button>
  );
}

/* ---------- Pipeline progress ---------- */
const STAGES = [
  ['fetching_page', 'Fetch product'],
  ['analysing_image', 'Analyse image'],
  ['searching_instagram', 'Search Instagram'],
  ['searching_meta', 'Search Meta Ads'],
  ['searching_tiktok', 'Search TikTok'],
  ['scoring', 'Score & de-dupe'],
];
export function Pipeline({ stages, live, running, tiktok }) {
  const list = STAGES.filter(([k]) => k !== 'searching_tiktok' || tiktok || stages.searching_tiktok);
  return (
    <section className="card pipeline" aria-label="Pipeline progress" aria-live="polite">
      {list.map(([key, label]) => {
        const s = stages[key];
        const src = key.startsWith('searching_') ? live[key.replace('searching_', '')] : null;
        const status = s?.status || (running ? 'waiting' : 'idle');
        let detail = s?.detail || (status === 'running' ? 'running…' : status === 'waiting' ? 'waiting' : '');
        if (src && status === 'running') detail = src.query ? `${src.shown ?? 0}/${src.need ?? 20} · ${src.query}` : `${src.shown ?? 0}/${src.need ?? 20}`;
        return (
          <div key={key} className={`stage ${status}`}>
            <div className="bar" />
            <span className="stage-label">{label}</span>
            <span className="mono muted trunc" title={detail}>{detail}</span>
          </div>
        );
      })}
    </section>
  );
}

/* ---------- KPIs ---------- */
export function Kpis({ data, live, min }) {
  const vids = data?.videos || [];
  const shown = (p) => vids.filter((v) => v.platform === p && v.status === 'shown').length || live[p]?.shown || 0;
  const scores = vids.filter((v) => v.status === 'shown').map((v) => v.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const dedup = data?.sources?.dedup ? Object.values(data.sources.dedup).reduce((a, b) => a + b, 0) : null;
  const tile = (label, value, pct, tone, sub) => (
    <div className="card kpi" key={label}>
      <span className="muted sm">{label}</span>
      <span className="kpi-value">{value}</span>
      <div className="meter"><div style={{ width: `${Math.min(100, pct)}%` }} className={tone} /></div>
      <span className="muted sm">{sub}</span>
    </div>
  );
  const ig = shown('instagram'); const me = shown('meta');
  return (
    <section className="kpis" aria-label="Summary">
      {tile('Instagram Reels', `${ig} / ${min}`, (ig / min) * 100, ig >= min ? 'good' : 'warn', ig >= min ? 'Minimum met' : 'Below minimum')}
      {tile('Meta video ads', `${me} / ${min}`, (me / min) * 100, me >= min ? 'good' : 'warn', me >= min ? 'Minimum met' : 'Below minimum')}
      {tile('Average match score', avg ?? '–', avg ?? 0, 'blue', 'Shown videos only')}
      {tile('Duplicates removed', dedup ?? '–', dedup ? Math.min(100, dedup * 4) : 0, 'gray', 'Repeats, reposts, seen before')}
    </section>
  );
}

/* ---------- Product panel ---------- */
export function ProductPanel({ product }) {
  if (!product) return null;
  const a = product.analysis || {};
  const attrs = [
    ['Type', a.productType], ['Colours', (a.colors || []).join(', ')], ['Print / graphic', a.printOrGraphic],
    ['Material', a.material], ['Shape / fit', a.shape], ['Logos', (a.logos || []).join(', ')], ['Text on product', (a.textOnProduct || []).join(', ')],
  ].filter(([, v]) => v && v !== 'unknown');
  const tags = [...(a.queries?.hashtags || []).slice(0, 6).map((h) => `#${h}`), ...(a.queries?.exact || []).slice(0, 2).map((x) => `“${x}”`)];
  return (
    <section className="card product" aria-label="Product">
      <div className="product-img">{product.imagePath ? <img src={product.imagePath} alt={product.title} /> : <span className="muted sm">No product image – matching uses the text description</span>}</div>
      <div className="product-main">
        <span className="eyebrow">Product context</span>
        <h2>{product.title || 'Image search'}</h2>
        {product.description && <p className="muted clamp3">{product.description}</p>}
        <span className="muted sm">{[product.brand, product.price && `Price ${product.price}`, `Source: ${product.source}${product.cached ? ' (cached)' : ''}`].filter(Boolean).join(' · ')}</span>
        {product.url && <a className="sm" href={product.url} target="_blank" rel="noreferrer">Open product page</a>}
      </div>
      <div className="product-attrs">
        <span className="eyebrow">Detected by image brain {a.engine === 'gemini' ? '' : '(keyword fallback)'}</span>
        <dl className="attr-grid">{attrs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {a.distinctiveFeatures?.length > 0 && <p className="sm"><b>Distinctive:</b> {a.distinctiveFeatures.join('; ')}</p>}
        <div className="tags">{tags.map((t) => <span key={t} className="tag mono">{t}</span>)}</div>
      </div>
    </section>
  );
}

/* ---------- Notices (shortfalls, failures, warnings) ---------- */
export function Notices({ data, product, health, error }) {
  const items = [];
  if (error) items.push({ tone: 'error', title: error.message, body: error.hint || 'Check the input and try again. If it keeps happening, check the backend terminal for details.' });
  if (health?.vision && health.vision.ok === false) items.push({ tone: 'warn', title: 'Vision model unavailable', body: `${health.vision.reason}. Scores use local image similarity only.` });
  if (product?.analysis?.warning) items.push({ tone: 'warn', title: 'Image analysis fell back to keywords', body: product.analysis.warning });
  for (const [key, r] of Object.entries(data?.sources || {})) {
    if (!r || typeof r !== 'object' || !r.status || r.status === 'ok') continue;
    items.push({ tone: r.status === 'failed' ? 'error' : 'warn', title: `${r.label}: ${r.status === 'failed' ? 'source failed' : `${r.shown} of ${r.need || 15} found`}`, body: `${r.message || ''} ${r.status === 'shortfall' ? 'Try a broader product name, add a product image, or turn on "All" scores to see weaker matches.' : ''}`, key });
  }
  return items.map((n, i) => (
    <div key={n.key || i} className={`notice ${n.tone}`} role="status"><AlertIcon /><span><b>{n.title}</b> {n.body}</span></div>
  ));
}

/* ---------- Results ---------- */
export function Results({ data, running, min, shortlist, onToggleShort, onOpen }) {
  const [tab, setTab] = useState('instagram');
  const [minScore, setMinScore] = useState(50);
  const [showSeen, setShowSeen] = useState(true);
  const [sort, setSort] = useState('score');
  const vids = data?.videos || [];

  const count = (p) => vids.filter((v) => (p === 'all' || v.platform === p) && v.status === 'shown').length;
  const platforms = ['instagram', 'meta', ...(vids.some((v) => v.platform === 'tiktok') || data?.sources?.tiktok ? ['tiktok'] : []), 'all'];
  const list = useMemo(() => {
    let l = vids.filter((v) => tab === 'all' || v.platform === tab);
    l = l.filter((v) => (v.status === 'previously_seen' ? showSeen : true));
    l = l.filter((v) => v.score >= minScore || (minScore === 0));
    l = [...l].sort(sort === 'new' ? (a, b) => (b.postedAt || 0) - (a.postedAt || 0) : (a, b) => b.score - a.score);
    return l;
  }, [vids, tab, minScore, showSeen, sort]);

  return (
    <section className="card results" aria-label="Results">
      <div className="results-bar">
        <div className="tabs" role="tablist">
          {platforms.map((p) => (
            <button key={p} role="tab" aria-selected={tab === p} className={`tab ${tab === p ? 'on' : ''}`} onClick={() => setTab(p)}>
              {p === 'all' ? 'All' : PLATFORM[p].replace(' Reel', ' Reels').replace('Meta ad', 'Meta Ad Library')}
              <span className={`count ${p !== 'all' && p !== 'tiktok' ? (count(p) >= min ? 'good' : 'warn') : ''}`}>{p === 'all' || p === 'tiktok' ? count(p) : `${count(p)}/${min}`}</span>
            </button>
          ))}
        </div>
        <div className="filters">
          <div className="seg" role="group" aria-label="Minimum match score">
            {[[0, 'All'], [50, '50+'], [70, '70+']].map(([v, l]) => <button key={v} aria-pressed={minScore === v} className={minScore === v ? 'on' : ''} onClick={() => setMinScore(v)}>{l}</button>)}
          </div>
          <Toggle label="Show previously seen" on={showSeen} onChange={setShowSeen} />
          <label htmlFor="sort" className="sr-only">Sort</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="score">Sort: Match score</option>
            <option value="new">Sort: Newest first</option>
          </select>
        </div>
      </div>
      {list.length > 0 ? (
        <div className="grid">
          {list.map((v) => <VideoCard key={v.id} v={v} saved={shortlist.has(v.id)} onToggleShort={() => onToggleShort(v)} onOpen={() => onOpen(v)} />)}
          {running && <div className="card-skeleton" />}
        </div>
      ) : running ? (
        <div className="grid">{[1, 2, 3, 4].map((i) => <div key={i} className="card-skeleton" />)}</div>
      ) : (
        <div className="empty">
          <b>{vids.length ? 'No videos match these filters' : 'No videos yet for this source'}</b>
          <span className="muted">{vids.length ? 'Lower the minimum score to "All" or switch on previously seen videos.' : 'See the notices above for what each source returned.'}</span>
        </div>
      )}
    </section>
  );
}

function VideoCard({ v, saved, onToggleShort, onOpen }) {
  const b = band(v.score);
  return (
    <article className={`video ${v.status}`}>
      <button className="thumb" onClick={onOpen} aria-label="Open video and score details">
        {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : <span className="muted sm">No thumbnail</span>}
        <span className="play"><PlayIcon size={16} /></span>
        <span className={`badge platform ${v.platform}`}>{PLATFORM[v.platform]}</span>
        {v.status === 'previously_seen' && <span className="badge seen">Seen before</span>}
      </button>
      <div className="video-body">
        <div className="score-row">
          <span className={`score mono ${b}`}>{v.score}</span>
          <div className="meter"><div className={b} style={{ width: `${v.score}%` }} /></div>
          <span className={`verdict ${b}`}>{b === 'exact' ? 'Exact match' : b === 'close' ? 'Close match' : 'Below threshold'}</span>
        </div>
        <span className="reason">{v.reason}</span>
        <p className="caption clamp3">{v.caption || <span className="muted">No caption</span>}</p>
        <div className="video-foot">
          <span className="muted sm trunc">{[v.author, timeAgo(v.postedAt)].filter(Boolean).join(' · ')}</span>
          <a className="icon-btn" href={v.url} target="_blank" rel="noreferrer" aria-label="Open original"><ExternalIcon size={15} /></a>
          <button className={`icon-btn ${saved ? 'saved' : ''}`} aria-pressed={saved} aria-label={saved ? 'Remove from shortlist' : 'Add to shortlist'} onClick={onToggleShort}><BookmarkIcon filled={saved} size={15} /></button>
        </div>
      </div>
    </article>
  );
}

/* ---------- Detail drawer ---------- */
const CHECK_LABEL = { print: 'Print / graphic', colour: 'Colour', shape: 'Shape / fit', logoText: 'Logo / text', productVisible: 'Product visible' };
export function Drawer({ v, onClose, saved, onToggleShort }) {
  if (!v) return null;
  const b = band(v.score);
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" aria-label="Score details" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className={`badge platform ${v.platform}`}>{PLATFORM[v.platform]}</span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><XIcon /></button>
        </div>
        {v.mediaUrl ? (
          <video className="player" src={v.mediaUrl} poster={v.thumbnail || undefined} controls playsInline preload="none" />
        ) : (
          <a className="player link" href={v.url} target="_blank" rel="noreferrer">{v.thumbnail && <img src={v.thumbnail} alt="" />}<span className="btn primary">Watch on {PLATFORM[v.platform]}</span></a>
        )}
        <div className="big-score"><span className={`mono ${b}`}>{v.score}</span><span className={`verdict ${b}`}>{b === 'exact' ? 'Exact match' : b === 'close' ? 'Close match' : 'Below threshold'}</span></div>
        <p className="reason lg">{v.reason}</p>
        <div className="box">
          <span className="eyebrow">Score breakdown</span>
          <div className="row"><span>Image similarity (CLIP) × 0.35</span><span className="mono">{v.clipScore ?? '–'}</span></div>
          <div className="row"><span>Vision model verdict × 0.65</span><span className="mono">{v.llmScore ?? 'not checked'}</span></div>
          {v.query && <div className="row"><span>Found via</span><span className="mono">{v.query}</span></div>}
        </div>
        {v.checks && (
          <div className="box">
            <span className="eyebrow">Attribute check</span>
            {Object.entries(v.checks).map(([k, val]) => <div key={k} className="row"><span>{CHECK_LABEL[k] || k}</span><span className={`check ${val.replace('/', '')}`}>{val === 'match' ? 'Match' : val === 'partial' ? 'Partial' : val === 'no' ? 'No match' : 'n/a'}</span></div>)}
          </div>
        )}
        <p className="caption">{v.caption}</p>
        <div className="drawer-actions">
          <a className="btn primary" href={v.url} target="_blank" rel="noreferrer"><ExternalIcon /> Open original</a>
          <button className="btn ghost" onClick={onToggleShort}><BookmarkIcon filled={saved} /> {saved ? 'Saved' : 'Shortlist'}</button>
        </div>
      </aside>
    </div>
  );
}

/* ---------- Sidebar ---------- */
export function Sidebar({ history, activeId, onOpen, shortlistCount, health }) {
  return (
    <nav className="sidebar" aria-label="Search history">
      <div className="brand"><span className="logo"><PlayIcon size={13} /></span><div><b>ReelScout</b><span>Product video discovery</span></div></div>
      <div className="side-title">Recent searches</div>
      <div className="history">
        {history.length === 0 && <span className="muted sm pad">No searches yet</span>}
        {history.map((h) => (
          <button key={h.id} className={`hist ${h.id === activeId ? 'on' : ''}`} onClick={() => onOpen(h.id)}>
            <span className="trunc">{h.title}</span>
            <span className="sm">{timeAgo(h.createdAt)} · IG {h.counts.instagram} · Meta {h.counts.meta}{h.counts.tiktok ? ` · TT ${h.counts.tiktok}` : ''}{h.status === 'failed' ? ' · failed' : h.status === 'running' ? ' · running' : ''}</span>
          </button>
        ))}
      </div>
      <div className="side-foot">
        <a className="side-link" href="/api/shortlist/export.csv"><DownloadIcon size={14} /> Export shortlist ({shortlistCount})</a>
        <Health health={health} />
      </div>
    </nav>
  );
}

function Health({ health }) {
  if (!health) return <span className="sm status bad">Backend offline</span>;
  const row = (label, ok, note) => <span className="sm status-row"><span>{label}</span><span className={ok ? 'good-t' : 'warn-t'}>{note}</span></span>;
  return (
    <>
      {row('Video sources', !health.missingKeys.includes('APIFY_TOKEN'), health.missingKeys.includes('APIFY_TOKEN') ? 'Meta only' : 'Ready')}
      {row('Vision model', health.vision?.ok, health.vision?.ok ? (health.vision.model || 'Ready') : 'CLIP only')}
    </>
  );
}

/* ---------- Welcome / empty state ---------- */
export function Welcome({ onExample }) {
  return (
    <section className="card welcome">
      <h1>Find short-form videos that show your exact product</h1>
      <p className="muted">Type a product name, paste a product link (Shopify, Amazon or any brand site), or add a product photo. ReelScout pulls at least 20 Instagram Reels and 20 Meta Ad Library videos, checks each against the product image and explains every match score.</p>
      <div className="examples">
        <span className="muted sm">Try:</span>
        {['protein dark chocolate', 'oversized graphic tee', 'vitamin c face serum'].map((x) => <button key={x} className="tag-btn" onClick={() => onExample(x)}>{x}</button>)}
      </div>
    </section>
  );
}
