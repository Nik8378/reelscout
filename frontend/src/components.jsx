import { useMemo, useRef, useState } from 'react';
import { isUrl, fileToDataUrl, timeAgo, band, VERDICT, PLATFORM, PLATFORM_TAB } from './api.js';
import {
  SearchIcon,
  UploadIcon,
  PlayIcon,
  BookmarkIcon,
  AlertIcon,
  XIcon,
  ExternalIcon,
  DownloadIcon,
  MenuIcon,
  FilterIcon,
} from './icons.jsx';

/* ---------------- Search bar ---------------- */
export function SearchBar({ onSearch, running, health, onMenu }) {
  const [q, setQ] = useState('');
  const [image, setImage] = useState(null);
  const [tiktok, setTiktok] = useState(health?.tiktokDefault ?? true);
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
    onSearch({ q: q.trim(), image: image?.dataUrl, options: { tiktok } });
  };

  return (
    <form className="topbar" onSubmit={submit}>
      <button type="button" className="icon-btn menu-btn" aria-label="Open search history" onClick={onMenu}>
        <MenuIcon />
      </button>
      <label htmlFor="q" className="sr-only">
        Product name or product link
      </label>
      <div className="searchbox">
        <SearchIcon />
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Product name (e.g. protein dark chocolate) or paste a product link"
          autoComplete="off"
        />
        {q && <span className="pill blue">{isUrl(q) ? 'Product link' : 'Keyword'}</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
      <div className="topbar-actions">
        {image ? (
          <span className="chip-img">
            <img src={image.dataUrl} alt="" />
            <span className="trunc">{image.name}</span>
            <button type="button" className="icon-btn sm" aria-label="Remove image" onClick={() => setImage(null)}>
              <XIcon size={14} />
            </button>
          </span>
        ) : (
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
            <UploadIcon /> Add image
          </button>
        )}
        <Toggle label="TikTok" on={tiktok} onChange={setTiktok} title="Optional third source - never blocks Instagram or Meta" />
        <button className="btn primary" disabled={running}>
          {running ? 'Searching…' : 'Find videos'}
        </button>
      </div>
      {err && (
        <div className="form-error" role="alert">
          {err}
        </div>
      )}
    </form>
  );
}

export function Toggle({ label, on, onChange, title }) {
  return (
    <button type="button" className="toggle" aria-pressed={on} title={title} onClick={() => onChange(!on)}>
      <span className={`track ${on ? 'on' : ''}`}>
        <span className="knob" />
      </span>
      {label}
    </button>
  );
}

/* ---------------- Pipeline progress ---------------- */
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
        if (src && status === 'running') {
          detail = src.query ? `${src.shown ?? 0}/${src.need ?? 20} · ${src.query}` : `${src.shown ?? 0}/${src.need ?? 20}`;
        }
        return (
          <div key={key} className={`stage ${status}`}>
            <div className="bar" />
            <span className="stage-label">{label}</span>
            <span className="mono muted trunc" title={detail}>
              {detail}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/* ---------------- KPI tiles ---------------- */
export function Kpis({ data, live, min }) {
  const vids = data?.videos || [];
  const shown = (p) => vids.filter((v) => v.platform === p && v.status === 'shown').length || live[p]?.shown || 0;
  const scores = vids.filter((v) => v.status === 'shown').map((v) => v.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const dedup = data?.sources?.dedup ? Object.values(data.sources.dedup).reduce((a, b) => a + b, 0) : null;
  const ig = shown('instagram');
  const me = shown('meta');
  const tile = (label, value, pct, tone, sub) => (
    <div className="card kpi" key={label}>
      <span className="muted sm">{label}</span>
      <span className="kpi-value">{value}</span>
      <div className="meter">
        <div style={{ width: `${Math.min(100, pct)}%` }} className={tone} />
      </div>
      <span className="muted sm">{sub}</span>
    </div>
  );
  return (
    <section className="kpis" aria-label="Summary">
      {tile(
        'Instagram Reels',
        `${ig} / ${min}`,
        (ig / min) * 100,
        ig >= min ? 'good' : 'warn',
        ig >= min ? 'Minimum met' : 'Below minimum',
      )}
      {tile(
        'Meta video ads',
        `${me} / ${min}`,
        (me / min) * 100,
        me >= min ? 'good' : 'warn',
        me >= min ? 'Minimum met' : 'Below minimum',
      )}
      {tile('Average match score', avg ?? '–', avg ?? 0, 'blue', 'New videos only')}
      {tile('Duplicates removed', dedup ?? '–', dedup ? Math.min(100, dedup * 4) : 0, 'gray', 'Repeats, reposts, seen before')}
    </section>
  );
}

/* ---------------- Product panel ---------------- */
export function ProductPanel({ product }) {
  if (!product) return null;
  const a = product.analysis || {};
  const attrs = [
    ['Type', a.productType],
    ['Colours', (a.colors || []).join(', ')],
    ['Print / graphic', a.printOrGraphic],
    ['Material', a.material],
    ['Shape / fit', a.shape],
    ['Logos', (a.logos || []).join(', ')],
    ['Text on product', (a.textOnProduct || []).join(', ')],
  ].filter(([, v]) => v && v !== 'unknown');
  const tags = [
    ...(a.queries?.hashtags || []).slice(0, 6).map((h) => `#${h}`),
    ...(a.queries?.exact || []).slice(0, 2).map((x) => `“${x}”`),
  ];
  return (
    <section className="card product" aria-label="Product">
      <div className="product-img">
        {product.imagePath ? (
          <img src={product.imagePath} alt={product.title} />
        ) : (
          <span className="muted sm">No product image – matching uses the text description</span>
        )}
      </div>
      <div className="product-main">
        <span className="eyebrow">Product context</span>
        <h2>{product.title || 'Image search'}</h2>
        {product.description && <p className="muted clamp3">{product.description}</p>}
        <span className="muted sm">
          {[
            product.brand,
            product.price && `Price ${product.price}`,
            `Source: ${product.source}${product.cached ? ' (cached)' : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {product.url && (
          <a className="sm" href={product.url} target="_blank" rel="noreferrer">
            Open product page
          </a>
        )}
      </div>
      <div className="product-attrs">
        <span className="eyebrow">Detected by image brain {a.engine === 'gemini' ? '' : '(keyword fallback)'}</span>
        <dl className="attr-grid">
          {attrs.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {a.distinctiveFeatures?.length > 0 && (
          <p className="sm">
            <b>Distinctive:</b> {a.distinctiveFeatures.join('; ')}
          </p>
        )}
        <div className="tags">
          {tags.map((t) => (
            <span key={t} className="tag mono">
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Notices ---------------- */
export function Notices({ data, product, health, error }) {
  const items = [];
  if (error) {
    items.push({
      tone: 'error',
      title: error.message,
      body: error.hint || 'Check the input and try again. If it keeps happening, check the backend terminal.',
    });
  }
  if (health?.vision && health.vision.ok === false) {
    items.push({
      tone: 'warn',
      title: 'Vision model busy',
      body: `${health.vision.reason}. Scores use image similarity + captions meanwhile.`,
    });
  }
  if (product?.analysis?.warning)
    items.push({ tone: 'warn', title: 'Image analysis fell back to keywords', body: product.analysis.warning });
  for (const [key, r] of Object.entries(data?.sources || {})) {
    if (!r || typeof r !== 'object' || !r.status || r.status === 'ok') continue;
    items.push({
      key,
      tone: r.status === 'failed' ? 'error' : 'warn',
      title: `${r.label}: ${r.status === 'failed' ? 'source failed' : `${r.shown} of ${r.need || 15} found`}`,
      body: `${r.message || ''} ${r.status === 'shortfall' ? 'Try a broader product name, add a product image, or set Match to "All".' : ''}`,
    });
  }
  return items.map((n, i) => (
    <div key={n.key || i} className={`notice ${n.tone}`} role="status">
      <AlertIcon />
      <span>
        <b>{n.title}</b> {n.body}
      </span>
    </div>
  ));
}

/* ---------------- Results + filters ---------------- */
const DEFAULT_FILTERS = { q: '', match: 'shown', posted: 'any', sort: 'score', seen: false, saved: false };
const DAY = 86400000;
const POSTED = { any: Infinity, 7: 7 * DAY, 30: 30 * DAY, 90: 90 * DAY, 365: 365 * DAY };

export function Results({ data, running, min, shortlist, onToggleShort, onOpen }) {
  const [tab, setTab] = useState('instagram');
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const vids = data?.videos || [];

  const newCount = (p) => vids.filter((v) => (p === 'all' || v.platform === p) && v.status === 'shown').length;
  const platforms = [
    'instagram',
    'meta',
    ...(vids.some((v) => v.platform === 'tiktok') || data?.sources?.tiktok ? ['tiktok'] : []),
    'all',
  ];
  const seenCount = vids.filter((v) => v.status === 'previously_seen' && (tab === 'all' || v.platform === tab)).length;

  const inTab = useMemo(() => vids.filter((v) => tab === 'all' || v.platform === tab), [vids, tab]);
  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const now = Date.now();
    let l = inTab.filter((v) => {
      if (v.status === 'previously_seen' && !f.seen) return false;
      if (f.match === 'shown' && v.score < 50) return false;
      if (f.match === 'exact' && v.score < 70) return false;
      if (f.match === 'close' && (v.score < 50 || v.score >= 70)) return false;
      if (f.match === 'below' && v.score >= 50) return false;
      if (f.posted !== 'any' && (!v.postedAt || now - v.postedAt > POSTED[f.posted])) return false;
      if (f.saved && !shortlist.has(v.id)) return false;
      if (q && !`${v.caption || ''} ${v.author || ''} ${v.reason || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      score: (a, b) => b.score - a.score,
      new: (a, b) => (b.postedAt || 0) - (a.postedAt || 0),
      old: (a, b) => (a.postedAt || Infinity) - (b.postedAt || Infinity),
      low: (a, b) => a.score - b.score,
    }[f.sort];
    return [...l].sort(by);
  }, [inTab, f, shortlist]);

  const active = Object.keys(DEFAULT_FILTERS).filter((k) => f[k] !== DEFAULT_FILTERS[k]).length;

  return (
    <section className="card results" aria-label="Results">
      <div className="results-bar">
        <div className="tabs" role="tablist">
          {platforms.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={tab === p}
              className={`tab ${tab === p ? 'on' : ''}`}
              onClick={() => setTab(p)}
            >
              {PLATFORM_TAB[p]}
              <span className={`count ${p !== 'all' && p !== 'tiktok' ? (newCount(p) >= min ? 'good' : 'warn') : ''}`}>
                {p === 'all' || p === 'tiktok' ? newCount(p) : `${newCount(p)}/${min}`}
              </span>
            </button>
          ))}
        </div>
        <div className="results-tools">
          <span className="muted sm">
            Showing {list.length} of {inTab.filter((v) => v.status !== 'previously_seen' || f.seen).length}
          </span>
          <button
            className={`btn ghost sm-btn filter-btn ${showFilters ? 'on' : ''}`}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((s) => !s)}
          >
            <FilterIcon /> Filters{active ? ` (${active})` : ''}
          </button>
        </div>
      </div>

      <div className={`filters ${showFilters ? 'open' : ''}`}>
        <label className="field grow">
          <span>Search in results</span>
          <input type="search" value={f.q} onChange={set('q')} placeholder="Caption, creator or reason…" />
        </label>
        <label className="field">
          <span>Match</span>
          <select value={f.match} onChange={set('match')}>
            <option value="shown">Matches (50+)</option>
            <option value="exact">Exact only (70+)</option>
            <option value="close">Close only (50–69)</option>
            <option value="below">Below threshold (&lt;50)</option>
            <option value="all">All scores</option>
          </select>
        </label>
        <label className="field">
          <span>Posted</span>
          <select value={f.posted} onChange={set('posted')}>
            <option value="any">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
        </label>
        <label className="field">
          <span>Sort</span>
          <select value={f.sort} onChange={set('sort')}>
            <option value="score">Best match first</option>
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
            <option value="low">Lowest score first</option>
          </select>
        </label>
        <div className="field toggles">
          <Toggle
            label={`Show previously seen${seenCount ? ` (${seenCount})` : ''}`}
            on={f.seen}
            onChange={set('seen')}
            title="Videos returned by earlier searches - hidden by default so every search shows new videos"
          />
          <Toggle label="Shortlisted only" on={f.saved} onChange={set('saved')} />
          {active > 0 && (
            <button className="link-btn" onClick={() => setF(DEFAULT_FILTERS)}>
              Reset filters
            </button>
          )}
        </div>
      </div>

      {list.length > 0 ? (
        <div className="grid">
          {list.map((v) => (
            <VideoCard
              key={v.id}
              v={v}
              saved={shortlist.has(v.id)}
              onToggleShort={() => onToggleShort(v)}
              onOpen={() => onOpen(v)}
            />
          ))}
          {running && <div className="card-skeleton" />}
        </div>
      ) : running ? (
        <div className="grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-skeleton" />
          ))}
        </div>
      ) : (
        <div className="empty">
          <b>{vids.length ? 'No videos match these filters' : 'No videos yet for this source'}</b>
          <span className="muted">
            {vids.length
              ? 'Reset the filters, set Match to "All scores", or switch on previously seen videos.'
              : 'See the notices above for what each source returned.'}
          </span>
          {active > 0 && (
            <button className="btn ghost" onClick={() => setF(DEFAULT_FILTERS)}>
              Reset filters
            </button>
          )}
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
        <span className="play">
          <PlayIcon size={16} />
        </span>
        <span className="badge platform">{PLATFORM[v.platform]}</span>
        {v.status === 'previously_seen' && <span className="badge seen">Seen before</span>}
      </button>
      <div className="video-body">
        <div className="score-row">
          <span className={`score mono ${b}`}>{v.score}</span>
          <div className="meter">
            <div className={b} style={{ width: `${v.score}%` }} />
          </div>
          <span className={`verdict ${b}`}>{VERDICT[b]}</span>
        </div>
        <span className="reason">{v.reason}</span>
        <p className="caption clamp3">{v.caption || <span className="muted">No caption</span>}</p>
        <div className="video-foot">
          <span className="muted sm trunc">{[v.author, timeAgo(v.postedAt)].filter(Boolean).join(' · ')}</span>
          <a className="icon-btn" href={v.url} target="_blank" rel="noreferrer" aria-label="Open original">
            <ExternalIcon size={15} />
          </a>
          <button
            className={`icon-btn ${saved ? 'saved' : ''}`}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from shortlist' : 'Add to shortlist'}
            onClick={onToggleShort}
          >
            <BookmarkIcon filled={saved} size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------------- Detail drawer ---------------- */
const CHECK_LABEL = {
  print: 'Print / graphic',
  colour: 'Colour',
  shape: 'Shape / fit',
  logoText: 'Logo / text',
  productVisible: 'Product visible',
};
const CHECK_TEXT = { match: 'Match', partial: 'Partial', no: 'No match', 'n/a': 'n/a' };
const SITE = { instagram: 'Instagram', meta: 'Facebook', tiktok: 'TikTok' };

export function Drawer({ v, onClose, saved, onToggleShort }) {
  const [videoFailed, setVideoFailed] = useState(false);
  if (!v) return null;
  const b = band(v.score);
  const canPlay = v.mediaUrl && !videoFailed;
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" aria-label="Score details" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="badge platform static">{PLATFORM[v.platform]}</span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <XIcon />
          </button>
        </div>
        {canPlay ? (
          <video
            key={v.id}
            className="player"
            src={v.mediaUrl}
            poster={v.thumbnail || undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <div className="player link">
            {v.thumbnail && <img src={v.thumbnail} alt="" />}
            <a className="btn primary" href={v.url} target="_blank" rel="noreferrer">
              <ExternalIcon /> Watch on {SITE[v.platform]}
            </a>
          </div>
        )}
        {!canPlay && (
          <p className="muted sm">
            {v.platform === 'tiktok'
              ? 'TikTok is blocked in India, so its videos cannot stream here. Data still arrives through the provider (servers outside India); set TIKTOK_DOWNLOAD_VIDEOS=true to keep a playable copy.'
              : videoFailed
                ? "The platform's signed video link has expired - open the original instead."
                : 'No direct video file for this item - open the original to watch.'}
          </p>
        )}
        <div className="big-score">
          <span className={`mono ${b}`}>{v.score}</span>
          <span className={`verdict ${b}`}>{VERDICT[b]}</span>
          {v.status === 'previously_seen' && <span className="badge seen static">Seen before</span>}
        </div>
        <p className="reason lg">{v.reason}</p>
        <div className="box">
          <span className="eyebrow">Score breakdown</span>
          <div className="row">
            <span>Image similarity (CLIP) × 0.35</span>
            <span className="mono">{v.clipScore ?? '–'}</span>
          </div>
          <div className="row">
            <span>Vision model verdict × 0.65</span>
            <span className="mono">{v.llmScore ?? 'not checked'}</span>
          </div>
          {v.query && (
            <div className="row">
              <span>Found via</span>
              <span className="mono trunc">{v.query}</span>
            </div>
          )}
        </div>
        {v.checks && (
          <div className="box">
            <span className="eyebrow">Attribute check</span>
            {Object.entries(v.checks).map(([k, val]) => (
              <div key={k} className="row">
                <span>{CHECK_LABEL[k] || k}</span>
                <span className={`check ${val.replace('/', '')}`}>{CHECK_TEXT[val] || val}</span>
              </div>
            ))}
          </div>
        )}
        <p className="caption">{v.caption}</p>
        <div className="drawer-actions">
          <a className="btn primary" href={v.url} target="_blank" rel="noreferrer">
            <ExternalIcon /> Open original
          </a>
          <button className="btn ghost" onClick={onToggleShort}>
            <BookmarkIcon filled={saved} /> {saved ? 'Saved' : 'Shortlist'}
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
export function Sidebar({ history, activeId, onOpen, shortlistCount, health, open, onClose }) {
  return (
    <>
      {open && <div className="nav-scrim" onClick={onClose} aria-hidden="true" />}
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Search history">
        <div className="brand">
          <span className="logo">
            <PlayIcon size={13} />
          </span>
          <div>
            <b>ReelScout</b>
            <span>Product video discovery</span>
          </div>
          <button className="icon-btn nav-close" aria-label="Close menu" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>
        <div className="side-title">Recent searches</div>
        <div className="history">
          {history.length === 0 && <span className="muted sm pad">No searches yet</span>}
          {history.map((h) => (
            <button key={h.id} className={`hist ${h.id === activeId ? 'on' : ''}`} onClick={() => onOpen(h.id)}>
              <span className="trunc">{h.title}</span>
              <span className="sm">
                {timeAgo(h.createdAt)} · IG {h.counts.instagram} · Meta {h.counts.meta}
                {h.counts.tiktok ? ` · TT ${h.counts.tiktok}` : ''}
                {h.status === 'failed' ? ' · failed' : h.status === 'running' ? ' · running' : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="side-foot">
          <a className="side-link" href="/api/shortlist/export.csv">
            <DownloadIcon size={14} /> Export shortlist ({shortlistCount})
          </a>
          <Health health={health} />
        </div>
      </nav>
    </>
  );
}

function Health({ health }) {
  if (!health) return <span className="sm status bad">Backend offline</span>;
  const row = (label, ok, note) => (
    <span className="sm status-row">
      <span>{label}</span>
      <span className={ok ? 'good-t' : 'warn-t'}>{note}</span>
    </span>
  );
  return (
    <>
      {row(
        'Video sources',
        !health.missingKeys.includes('APIFY_TOKEN'),
        health.missingKeys.includes('APIFY_TOKEN') ? 'Meta only' : 'Ready',
      )}
      {row('Vision model', health.vision?.ok, health.vision?.ok ? health.vision.model || 'Ready' : 'Busy – CLIP only')}
    </>
  );
}

/* ---------------- Welcome ---------------- */
export function Welcome({ onExample }) {
  return (
    <section className="card welcome">
      <h1>Find short-form videos that show your exact product</h1>
      <p className="muted">
        Type a product name, paste a product link (Shopify, Amazon or any brand site), or add a product photo. ReelScout pulls at
        least 20 Instagram Reels and 20 Meta Ad Library videos (plus TikTok), checks each one against the product image and
        explains every match score. Repeat searches only show videos you have not seen.
      </p>
      <div className="examples">
        <span className="muted sm">Try:</span>
        {['protein dark chocolate', 'oversized graphic tee', 'vitamin c face serum'].map((x) => (
          <button key={x} className="tag-btn" onClick={() => onExample(x)}>
            {x}
          </button>
        ))}
      </div>
    </section>
  );
}
