import { useEffect, useMemo, useRef, useState } from 'react';
import { useLeads } from './lib/queries.js';
import { useTheme } from './lib/theme.js';
import { useHotkeys } from './lib/hotkeys.js';
import { SORTS, STATUSES, isPinned, sortLeads } from './lib/format.js';
import { useToast } from './components/Toast.jsx';
import LeadCard from './components/LeadCard.jsx';
import LeadDialog from './components/LeadDialog.jsx';
import AddLeadDialog from './components/AddLeadDialog.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

export const PAGE_SIZE = 20;

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const t = setInterval(update, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && update();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

export default function App() {
  const { data: leads, isPending, error, refetch, isFetching } = useLeads();
  const toast = useToast();
  const now = useNow();
  const [theme, toggleTheme] = useTheme();

  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('activity');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => setLimit(PAGE_SIZE), [filter, query, sort]);

  const hotkeys = useMemo(
    () => ({
      n: () => setAdding(true),
      '/': () => searchRef.current?.focus(),
    }),
    [],
  );
  useHotkeys(hotkeys, { disabled: adding || Boolean(openId) });

  const all = leads ?? [];

  const counts = useMemo(() => {
    const c = { All: all.length };
    STATUSES.forEach((s) => (c[s] = 0));
    all.forEach((l) => (c[l.status] += 1));
    return c;
  }, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (l) =>
        (filter === 'All' || l.status === filter) &&
        (!q || [l.name, l.company, l.phone].some((v) => (v || '').toLowerCase().includes(q))),
    );
  }, [all, filter, query]);

  const pinned = useMemo(
    () => visible.filter((l) => isPinned(l, now)).sort((a, b) => a.followUpAt.localeCompare(b.followUpAt)),
    [visible, now],
  );
  const rest = useMemo(() => {
    const pinnedIds = new Set(pinned.map((l) => l.id));
    return sortLeads(
      visible.filter((l) => !pinnedIds.has(l.id)),
      sort,
    );
  }, [visible, pinned, sort]);

  const shown = rest.slice(0, limit);
  const remaining = rest.length - shown.length;
  const hasData = leads !== undefined;

  return (
    <div className="app">
      <a className="skip-link" href="#leads">
        Skip to leads
      </a>

      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="logo">
            <span className="logo-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l6-6 4 4 8-9" />
              </svg>
            </span>
            LeadFlow
          </h1>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button className="btn btn-primary" onClick={() => setAdding(true)} aria-keyshortcuts="N">
              + Add New Lead <kbd aria-hidden="true">N</kbd>
            </button>
          </div>
        </div>
      </header>

      <main className="container" id="leads" tabIndex={-1}>
        <div className="toolbar">
          <div className="filters" role="group" aria-label="Filter by status">
            <span className="filters-label">Filters:</span>
            {['All', ...STATUSES].map((s) => (
              <button
                key={s}
                className={`pill ${filter === s ? 'pill-active' : ''}`}
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
              >
                {s}
                <span className="count">{counts[s] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="toolbar-right">
            <label className="sort">
              <span className="visually-hidden">Sort leads by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="select" aria-label="Sort leads by">
                {Object.entries(SORTS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {`Sort: ${label}`}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={searchRef}
              className="search"
              type="search"
              placeholder="Search name, company, phone…  ( / )"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search leads"
              aria-keyshortcuts="/"
            />
          </div>
        </div>

        {isPending && (
          <div className="stack" aria-busy="true" aria-label="Loading leads">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 82 }} />
            ))}
          </div>
        )}

        {error && !hasData && (
          <div className="banner-error big" role="alert">
            Couldn&apos;t load leads: {error.message}{' '}
            <button className="link-btn" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        )}

        {error && hasData && (
          <div className="banner-error stale" role="status">
            Couldn&apos;t refresh. Showing the last loaded data.{' '}
            <button className="link-btn" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </button>
          </div>
        )}

        {hasData && (
          <>
            {pinned.length > 0 && (
              <section aria-labelledby="pinned-title">
                <h2 className="section-title" id="pinned-title">
                  <span aria-hidden="true">📌</span> Today&apos;s follow-ups <span className="count-inline">{pinned.length}</span>
                </h2>
                <div className="stack">
                  {pinned.map((l) => (
                    <LeadCard key={l.id} lead={l} pinned onOpen={setOpenId} now={now} />
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="all-title">
              <h2 className="section-title" id="all-title">
                All leads <span className="count-inline neutral">{rest.length}</span>
              </h2>
              {rest.length === 0 ? (
                <div className="empty big">
                  <div className="empty-emoji" aria-hidden="true">{all.length === 0 ? '🚀' : '🔍'}</div>
                  <p>{all.length === 0 ? 'No leads yet.' : pinned.length ? 'No other leads match.' : 'No leads match your filters.'}</p>
                  <small>
                    {all.length === 0
                      ? 'Add your first lead to get started.'
                      : 'Try another status or clear the search.'}
                  </small>
                </div>
              ) : (
                <div className="stack">
                  {shown.map((l) => (
                    <LeadCard key={l.id} lead={l} onOpen={setOpenId} now={now} />
                  ))}
                  {remaining > 0 && (
                    <button type="button" className="btn btn-outline more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                      Show {Math.min(PAGE_SIZE, remaining)} more ({remaining} remaining)
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {openId && <LeadDialog leadId={openId} onClose={() => setOpenId(null)} now={now} />}

      {adding && (
        <AddLeadDialog
          onClose={() => setAdding(false)}
          onCreated={(lead) => {
            setAdding(false);
            toast.push(`Added ${lead.name}.`);
          }}
        />
      )}
    </div>
  );
}
