import React, { useState, useCallback, useEffect, useRef } from 'react';
import { History, Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import PageShell from '@/components/tools/PageShell';
import { loadEsEndpoints, ES_ACTIVE_LS_KEY, saveActiveEsEndpoint } from '@/lib/esEndpoints';

const INDEX = 'ai_responses';
const PAGE_SIZE = 50;
const SOURCE_FIELDS = ['prompt', 'response', 'model', 'datetime', 'tokens', 'timeTaken'];

const thStyle = { padding: '7px 10px', textAlign: 'left', color: 'rgba(0,255,204,0.4)', letterSpacing: '1.5px', fontSize: '0.6rem', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle = { padding: '7px 10px', fontSize: '0.72rem', fontFamily: 'Rajdhani, sans-serif', verticalAlign: 'top' };
const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340, color: 'rgba(0,255,204,0.65)' };

function buildQuery(q, model) {
  const must = q.trim()
    ? [{ multi_match: { query: q.trim(), fields: ['prompt', 'response', 'model'], fuzziness: 'AUTO' } }]
    : [{ match_all: {} }];
  const filter = model ? [{ term: { model } }] : [];
  return { bool: { must, filter } };
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export default function InteractionLogs() {
  const endpoints = loadEsEndpoints();
  const [activeEp, setActiveEp] = useState(() => Math.min(parseInt(localStorage.getItem(ES_ACTIVE_LS_KEY) || '0', 10), Math.max(0, endpoints.length - 1)));
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const ep = endpoints[activeEp]?.url;

  const search = useCallback(async (opts = {}) => {
    const { append = false, q = query, m = model } = opts;
    if (!ep) return;
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    setMissing(false);
    if (!append) { setRows([]); setExpanded(null); }
    try {
      const body = {
        from: append ? rows.length : 0,
        size: PAGE_SIZE,
        query: buildQuery(q, m),
        sort: [{ datetime: { order: 'desc', unmapped_type: 'date' } }],
        _source: SOURCE_FIELDS,
      };
      const res = await fetch(`${ep}/${INDEX}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 404) { setMissing(true); setRows([]); setTotal(0); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const hits = (json.hits?.hits || []).map(h => ({ _id: h._id, ...h._source }));
      setRows(prev => (append ? [...prev, ...hits] : hits));
      setTotal(json.hits?.total?.value || hits.length);
    } catch (e) {
      setError(e.message);
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, [ep, query, model, rows.length]);

  const loadModels = useCallback(async () => {
    if (!ep) return;
    try {
      const res = await fetch(`${ep}/${INDEX}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 0, aggs: { models: { terms: { field: 'model', size: 40 } } } }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setModels((json.aggregations?.models?.buckets || []).map(b => b.key));
    } catch { /* index not present yet — model filter stays empty */ }
  }, [ep]);

  // The archive loads itself as soon as the page opens (or the endpoint changes) —
  // REFRESH is only a manual re-run
  const bootedRef = useRef('');
  useEffect(() => {
    if (!ep || bootedRef.current === ep) return;
    bootedRef.current = ep;
    search({ q: '', m: '' });
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep]);

  const selectEp = (i) => {
    setActiveEp(i);
    saveActiveEsEndpoint(i);
  };

  const switchModel = (value) => {
    setModel(value);
    search({ m: value });
  };

  return (
    <PageShell
      title="INTERACTION LOGS"
      subtitle="EVERY ARCHIVED AI EXCHANGE — PROMPT, RESPONSE, TIMESTAMP & MODEL"
      icon={History}
    >
      <div className="tactical-panel rounded p-4 flex flex-col gap-3" style={{ minHeight: '70vh' }}>

        {/* Endpoint selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>ARCHIVE</span>
          {endpoints.map((e, i) => (
            <button key={i} onClick={() => selectEp(i)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 10px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: i === activeEp ? 'rgba(0,255,204,0.08)' : 'transparent', color: i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)' }}>
              {e.label}
            </button>
          ))}
          <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1 ml-auto" onClick={() => { search(); loadModels(); }} disabled={loading}>
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> REFRESH
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search({ q: query })}
              placeholder="Search prompts, responses and models..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: 3, fontSize: '0.78rem' }}
            />
          </div>
          <select value={model} onChange={e => switchModel(e.target.value)} style={{ padding: '7px 8px', borderRadius: 3, fontSize: '0.72rem', minWidth: 150 }}>
            <option value="">ALL MODELS</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="neon-btn px-4 py-2 rounded text-xs flex items-center gap-2" onClick={() => search({ q: query })} disabled={loading || !ep}>
            <Search size={11} /> SEARCH
          </button>
        </div>

        {/* Meta line */}
        {rows.length > 0 && (
          <div className="flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,255,204,0.08)', paddingBottom: 6 }}>
            <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
              {rows.length}{total > rows.length ? ` / ${total.toLocaleString()}` : ''} RECORDS
            </span>
            {model && <span style={{ fontSize: '0.58rem', color: 'rgba(126,184,255,0.5)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>MODEL: {model}</span>}
          </div>
        )}

        {error && <div style={{ color: '#ff4444', fontSize: '0.75rem', padding: '7px 11px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

        {/* Table */}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,255,204,0.15)' }}>
                  <th style={{ ...thStyle, width: 165 }}>TIMESTAMP</th>
                  <th style={{ ...thStyle, width: 145 }}>MODEL</th>
                  <th style={thStyle}>PROMPT</th>
                  <th style={thStyle}>RESPONSE</th>
                  <th style={{ ...thStyle, width: 34 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => {
                  const isOpen = expanded === ri;
                  return (
                    <React.Fragment key={r._id || ri}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : ri)}
                        style={{ borderBottom: '1px solid rgba(0,255,204,0.06)', cursor: 'pointer', background: isOpen ? 'rgba(0,255,204,0.04)' : 'transparent' }}
                      >
                        <td style={{ ...tdStyle, color: 'rgba(0,255,204,0.45)', whiteSpace: 'nowrap' }}>{fmtDate(r.datetime)}</td>
                        <td style={{ ...tdStyle, color: 'rgba(126,184,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.model || '—'}</td>
                        <td style={{ ...tdStyle, ...clip }} title={r.prompt}>{r.prompt || '—'}</td>
                        <td style={{ ...tdStyle, ...clip }} title={r.response}>{r.response || '—'}</td>
                        <td style={{ ...tdStyle, color: 'rgba(0,255,204,0.35)' }}>
                          {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={5} style={{ padding: '10px 14px 14px 14px', background: 'rgba(0,0,0,0.35)' }}>
                            <div className="flex flex-wrap gap-3" style={{ marginBottom: 8 }}>
                              <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>◈ PROMPT</span>
                              {r.tokens != null && <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px' }}>TOKENS: {r.tokens}</span>}
                              {r.timeTaken && <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px' }}>TIME: {r.timeTaken}</span>}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'rgba(0,255,204,0.75)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{r.prompt || '—'}</div>
                            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 6 }}>◈ RESPONSE</div>
                            <div style={{ fontSize: '0.74rem', color: 'rgba(0,255,204,0.6)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.response || '—'}</div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && rows.length < total && (
          <button className="neon-btn px-4 py-2 rounded text-xs flex items-center justify-center gap-2" onClick={() => search({ append: true })} disabled={loadingMore}>
            {loadingMore ? <RefreshCw size={11} className="animate-spin" /> : null}
            {loadingMore ? 'LOADING...' : `LOAD MORE (${total - rows.length} REMAINING)`}
          </button>
        )}

        {loading && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.3)', fontSize: '0.75rem', letterSpacing: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <RefreshCw size={13} className="animate-spin" /> FETCHING INTERACTIONS...
          </div>
        )}

        {missing && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.25)', fontSize: '0.75rem', letterSpacing: '2px', lineHeight: 2, fontFamily: 'Rajdhani, sans-serif' }}>
            NO ARCHIVE YET — AI RESPONSES ARE LOGGED TO THE<br />"ai_responses" INDEX AS SOON AS YOU USE THE AI TAB
          </div>
        )}

        {!missing && !loading && rows.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.2)', fontSize: '0.75rem', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
            NO INTERACTIONS MATCH THIS FILTER
          </div>
        )}
      </div>
    </PageShell>
  );
}