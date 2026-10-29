import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Database, RefreshCw, ChevronRight, ChevronDown, Trash2, Plus, Search, ChevronsUpDown, ChevronUp } from 'lucide-react';

import { loadEsEndpoints, saveEsEndpoints, ES_ACTIVE_LS_KEY } from '@/lib/esEndpoints';

const DB_ACTIVE_KEY = ES_ACTIVE_LS_KEY;

const CAT_HEADERS = {
  cluster: ['status', 'name', 'node.total', 'node.data', 'shards', 'pri', 'active_shards_percent'],
  indices: ['health', 'status', 'index', 'docs.count', 'docs.deleted', 'store.size', 'pri.store.size'],
  shards:  ['index', 'shard', 'prirep', 'state', 'docs', 'store', 'node'],
  aliases: ['alias', 'index', 'filter', 'routing.index'],
  nodes:   ['name', 'ip', 'heap.percent', 'ram.percent', 'cpu', 'load_1m', 'node.role'],
};

const VIEWS = Object.keys(CAT_HEADERS);

// Parse size strings like "4.2kb", "1.1mb" → bytes for sorting
function parseSize(s) {
  if (!s || s === '—') return -1;
  const m = String(s).match(/^([\d.]+)(kb|mb|gb|tb|b)?$/i);
  if (!m) return parseFloat(s) || 0;
  const n = parseFloat(m[1]);
  const u = (m[2] || 'b').toLowerCase();
  const mult = { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776 };
  return n * (mult[u] || 1);
}

function sortRows(rows, col, dir) {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? '';
    // Numeric / size fields
    const an = parseSize(av), bn = parseSize(bv);
    const isNum = !isNaN(an) && !isNaN(bn) && an !== -1 && bn !== -1;
    const cmp = isNum ? an - bn : String(av).localeCompare(String(bv));
    return dir === 'asc' ? cmp : -cmp;
  });
}

export default function DBPanel() {
  const [endpoints, setEndpoints] = useState(loadEsEndpoints);
  const [activeEp, setActiveEp] = useState(() => Math.min(parseInt(localStorage.getItem(DB_ACTIVE_KEY) || '0'), Math.max(0, loadEsEndpoints().length - 1)));
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [activeView, setActiveView] = useState('cluster');
  const [allData, setAllData] = useState({}); // { cluster: [...], indices: [...], ... }
  const [loadingViews, setLoadingViews] = useState({});
  const [error, setError] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [subData, setSubData] = useState({});
  const [subLoading, setSubLoading] = useState({});
  // Indices sort
  const [sortCol, setSortCol] = useState('index');
  const [sortDir, setSortDir] = useState('asc');
  // Indices search / drill-down
  const [indexSearch, setIndexSearch] = useState('');
  // Track connected ep to avoid re-fetching
  const connectedEpRef = useRef(null);

  const ep = endpoints[activeEp]?.url || '';

  const fetchView = useCallback(async (view, baseUrl) => {
    setLoadingViews(p => ({ ...p, [view]: true }));
    try {
      const path = view === 'cluster' ? '_cat/health?format=json&v' : `_cat/${view}?format=json&v`;
      const res = await fetch(`${baseUrl}/${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAllData(p => ({ ...p, [view]: json }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingViews(p => ({ ...p, [view]: false }));
    }
  }, []);

  // Pre-fetch all views on connect
  const connectEndpoint = useCallback(async (index) => {
    const baseUrl = endpoints[index]?.url;
    if (!baseUrl) return;
    setActiveEp(index); localStorage.setItem(DB_ACTIVE_KEY, index);
    setAllData({});
    setExpandedRow(null);
    setError('');
    connectedEpRef.current = baseUrl;
    // Fire all view fetches in parallel
    await Promise.all(VIEWS.map(v => fetchView(v, baseUrl)));
  }, [endpoints, fetchView]);

  const refreshAll = useCallback(() => {
    if (!ep) return;
    setAllData({});
    setExpandedRow(null);
    setError('');
    VIEWS.forEach(v => fetchView(v, ep));
  }, [ep, fetchView]);

  // Every view loads as soon as the panel opens — no endpoint click needed
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    connectEndpoint(activeEp);
  }, [activeEp, connectEndpoint]);

  const fetchSub = useCallback(async (index, type) => {
    const key = `${index}_${type}`;
    setSubLoading(p => ({ ...p, [key]: true }));
    try {
      let url;
      if (type === 'docs')   url = `${ep}/${index}/_count`;
      else if (type === 'fields') url = `${ep}/${index}/_mapping`;
      else if (type === 'stats')  url = `${ep}/${index}/_stats/docs,store`;
      const res = await fetch(url);
      const json = await res.json();
      let result;
      if (type === 'docs') result = { count: json.count };
      else if (type === 'fields') {
        const mappings = json[index]?.mappings?.properties || {};
        result = Object.entries(mappings).map(([k, v]) => ({ field: k, type: v.type || 'object' }));
      } else if (type === 'stats') {
        const s = json._all?.primaries;
        result = { docs: s?.docs?.count, deleted: s?.docs?.deleted, size: s?.store?.size_in_bytes };
      }
      setSubData(p => ({ ...p, [key]: result }));
    } catch (e) { setSubData(p => ({ ...p, [key]: { error: e.message } })); }
    finally { setSubLoading(p => ({ ...p, [key]: false })); }
  }, [ep]);

  const addEndpoint = () => {
    if (!newUrl.trim()) return;
    const next = [...endpoints, { url: newUrl.trim(), label: newLabel || newUrl.trim() }];
    setEndpoints(next); saveEsEndpoints(next);
    setNewUrl(''); setNewLabel(''); setShowAdd(false);
    connectEndpoint(next.length - 1);
  };

  const removeEndpointSafe = (i) => {
    removeEndpoint(i);
    const newActive = Math.min(activeEp, endpoints.length - 2);
    localStorage.setItem(DB_ACTIVE_KEY, Math.max(0, newActive));
  };

  const removeEndpoint = (i) => {
    const next = endpoints.filter((_, idx) => idx !== i);
    setEndpoints(next); saveEsEndpoints(next);
    if (activeEp >= next.length) setActiveEp(Math.max(0, next.length - 1));
  };

  const handleSortCol = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const headers = CAT_HEADERS[activeView] || [];
  const rawRows = Array.isArray(allData[activeView]) ? allData[activeView] : [];

  // Apply search filter (prefix-based) for indices
  const filteredRows = activeView === 'indices' && indexSearch.trim()
    ? rawRows.filter(r => (r.index || '').toLowerCase().startsWith(indexSearch.trim().toLowerCase()))
    : rawRows;

  // Apply sort for indices
  const rows = activeView === 'indices' ? sortRows(filteredRows, sortCol, sortDir) : filteredRows;

  const isViewLoading = (v) => !!loadingViews[v];
  const anyLoading = VIEWS.some(v => isViewLoading(v));

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3" style={{ minHeight: '70vh' }}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Database size={13} style={{ color: 'var(--neon-primary)' }} />
        <span className="neon-text text-xs tracking-widest uppercase flex-1">ELASTICSEARCH</span>
        <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={refreshAll} disabled={anyLoading}>
          <RefreshCw size={10} className={anyLoading ? 'animate-spin' : ''} /> REFRESH ALL
        </button>
      </div>

      {/* Endpoint selector */}
      <div className="flex flex-wrap gap-2 items-center">
        {endpoints.map((ep2, i) => (
          <div key={i} className="flex items-center gap-1">
            <button
              onClick={() => connectEndpoint(i)}
              style={{
                fontFamily: 'Rajdhani, sans-serif', fontSize: '0.7rem', letterSpacing: '1px',
                padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
                border: `1px solid ${i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`,
                background: i === activeEp ? 'rgba(0,255,204,0.08)' : 'transparent',
                color: i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.5)',
              }}
            >
              {ep2.label}
              {anyLoading && i === activeEp && <RefreshCw size={8} className="inline ml-1 animate-spin" />}
            </button>
            {endpoints.length > 1 && (
              <button onClick={() => removeEndpoint(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.4)', padding: '2px' }}>
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setShowAdd(v => !v)} className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1">
          <Plus size={10} /> ADD
        </button>
      </div>

      {showAdd && (
        <div className="flex gap-2 flex-wrap">
          <input type="text" placeholder="Label" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ width: 90, padding: '4px 8px', borderRadius: 3, fontSize: '0.75rem' }} />
          <input type="text" placeholder="http://..." value={newUrl} onChange={e => setNewUrl(e.target.value)} style={{ flex: 1, padding: '4px 8px', borderRadius: 3, fontSize: '0.75rem' }} onKeyDown={e => e.key === 'Enter' && addEndpoint()} />
          <button className="neon-btn px-3 py-1 rounded text-xs" onClick={addEndpoint}>CONNECT</button>
        </div>
      )}

      {/* Cat view tabs with loading indicators */}
      <div className="flex gap-1 flex-wrap">
        {VIEWS.map(v => (
          <button key={v} onClick={() => { setActiveView(v); setExpandedRow(null); }}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${activeView === v ? 'var(--neon-primary)' : 'rgba(0,255,204,0.15)'}`, color: activeView === v ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: activeView === v ? 'rgba(0,255,204,0.07)' : 'transparent', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {v}
            {isViewLoading(v) && <RefreshCw size={8} className="animate-spin" />}
            {!isViewLoading(v) && allData[v] && (
              <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.35)' }}>
                {Array.isArray(allData[v]) ? allData[v].length : '✓'}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Indices: search/drill-down bar */}
      {activeView === 'indices' && (
        <div className="flex items-center gap-2">
          <Search size={11} style={{ color: 'rgba(0,255,204,0.35)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="PREFIX FILTER (e.g. logs-2024)..."
            value={indexSearch}
            onChange={e => { setIndexSearch(e.target.value); setExpandedRow(null); }}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 3, fontSize: '0.72rem' }}
          />
          {indexSearch && (
            <button onClick={() => setIndexSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', fontSize: '0.7rem', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
              ✕ CLEAR
            </button>
          )}
          {indexSearch && (
            <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
              {rows.length} / {rawRows.length}
            </span>
          )}
        </div>
      )}

      {error && <div style={{ color: '#ff4444', fontSize: '0.75rem', padding: '6px 10px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

      {/* Table */}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'Rajdhani, sans-serif' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,255,204,0.15)' }}>
                {activeView === 'indices' && <th style={thStyle}></th>}
                {headers.map(h => (
                  <th key={h} style={{ ...thStyle, cursor: activeView === 'indices' ? 'pointer' : 'default', userSelect: 'none' }}
                    onClick={() => activeView === 'indices' && handleSortCol(h)}>
                    <span className="flex items-center gap-1">
                      {h.toUpperCase()}
                      {activeView === 'indices' && (
                        sortCol === h
                          ? (sortDir === 'asc' ? <ChevronUp size={9} style={{ color: 'var(--neon-primary)' }} /> : <ChevronDown size={9} style={{ color: 'var(--neon-primary)' }} />)
                          : <ChevronsUpDown size={9} style={{ color: 'rgba(0,255,204,0.2)' }} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const indexName = row.index || row.name;
                const isExpanded = expandedRow === ri;
                return (
                  <React.Fragment key={ri}>
                    <tr
                      style={{ borderBottom: '1px solid rgba(0,255,204,0.06)', cursor: activeView === 'indices' ? 'pointer' : 'default', background: isExpanded ? 'rgba(0,255,204,0.04)' : 'transparent' }}
                      onClick={() => activeView === 'indices' && setExpandedRow(isExpanded ? null : ri)}
                    >
                      {activeView === 'indices' && (
                        <td style={tdStyle}>{isExpanded ? <ChevronDown size={11} style={{ color: 'var(--neon-primary)' }} /> : <ChevronRight size={11} style={{ color: 'rgba(0,255,204,0.3)' }} />}</td>
                      )}
                      {headers.map(h => (
                        <td key={h} style={{ ...tdStyle, color: h === 'health' ? healthColor(row[h]) : h === 'status' ? 'rgba(255,255,255,0.8)' : 'rgba(0,255,204,0.7)' }}>
                          {/* Highlight prefix match in index column */}
                          {h === 'index' && indexSearch && String(row[h]).toLowerCase().startsWith(indexSearch.toLowerCase()) ? (
                            <>
                              <span style={{ color: 'var(--neon-primary)', fontWeight: 700 }}>{String(row[h]).slice(0, indexSearch.length)}</span>
                              <span style={{ color: 'rgba(0,255,204,0.55)' }}>{String(row[h]).slice(indexSearch.length)}</span>
                            </>
                          ) : (row[h] ?? '—')}
                        </td>
                      ))}
                    </tr>

                    {/* Expanded index sub-rows */}
                    {isExpanded && activeView === 'indices' && indexName && (
                      <tr>
                        <td colSpan={headers.length + 1} style={{ padding: '6px 14px 10px 28px', background: 'rgba(0,0,0,0.3)' }}>
                          <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '2px', marginBottom: 6 }}>⬡ {indexName}</div>
                          <div className="flex gap-2 mb-2 flex-wrap">
                            {['docs', 'fields', 'stats'].map(sub => {
                              const key = `${indexName}_${sub}`;
                              const busy = subLoading[key];
                              return (
                                <button key={sub} onClick={e => { e.stopPropagation(); fetchSub(indexName, sub); }}
                                  className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" disabled={busy}>
                                  {busy ? <RefreshCw size={9} className="animate-spin" /> : null}
                                  {sub.toUpperCase()}
                                </button>
                              );
                            })}
                          </div>
                          {['docs', 'fields', 'stats'].map(sub => {
                            const key = `${indexName}_${sub}`;
                            const loaded = subData[key];
                            if (!loaded) return null;
                            if (loaded.error) return <div key={sub} style={{ color: '#ff4444', fontSize: '0.7rem' }}>{sub}: {loaded.error}</div>;
                            if (sub === 'fields' && Array.isArray(loaded)) return (
                              <div key={sub} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 4 }}>FIELDS ({loaded.length})</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {loaded.map(f => (
                                    <span key={f.field} style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10, border: '1px solid rgba(0,255,204,0.2)', color: 'rgba(0,255,204,0.6)' }}>
                                      {f.field} <span style={{ opacity: 0.45 }}>({f.type})</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                            return (
                              <div key={sub} style={{ fontSize: '0.7rem', color: 'rgba(0,255,204,0.65)', marginBottom: 6 }}>
                                {Object.entries(loaded).map(([k, v]) => (
                                  <span key={k} style={{ marginRight: 14 }}><span style={{ opacity: 0.5 }}>{k}:</span> {v ?? '—'}</span>
                                ))}
                              </div>
                            );
                          })}
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

      {!anyLoading && !error && rows.length === 0 && rawRows.length > 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(0,255,204,0.2)', fontSize: '0.75rem', letterSpacing: '2px' }}>
          NO INDICES MATCH PREFIX "{indexSearch}"
        </div>
      )}

      {!anyLoading && !error && rawRows.length === 0 && Object.keys(allData).length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.2)', fontSize: '0.75rem', letterSpacing: '2px' }}>
          NO DATA — CHECK THE ENDPOINT ABOVE
        </div>
      )}

      {isViewLoading(activeView) && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(0,255,204,0.3)', fontSize: '0.75rem', letterSpacing: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <RefreshCw size={13} className="animate-spin" /> FETCHING {activeView.toUpperCase()}...
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '6px 10px', textAlign: 'left', color: 'rgba(0,255,204,0.4)', letterSpacing: '1.5px', fontSize: '0.62rem', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle = { padding: '5px 10px', whiteSpace: 'nowrap' };
function healthColor(h) {
  if (h === 'green')  return '#00cc66';
  if (h === 'yellow') return '#ffcc00';
  if (h === 'red')    return '#ff3333';
  return 'rgba(0,255,204,0.6)';
}