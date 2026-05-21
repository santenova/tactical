import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Brain, Play, Square, Plus, Trash2, RefreshCw, CheckCircle, AlertCircle, Clock, Database } from 'lucide-react';

const BL_LS_KEY = 'tactical_browserless_endpoints';
const ES_LS_KEY = 'tactical_es_endpoints';
const CORE_LS_KEY = 'tactical_knowledge_core_state';
const INDEX_PREFIX = 'knowledge_core_';

function loadBL() {
  try { return JSON.parse(localStorage.getItem(BL_LS_KEY)) || []; } catch { return []; }
}
function loadES() {
  try { return JSON.parse(localStorage.getItem(ES_LS_KEY)) || []; } catch { return []; }
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(CORE_LS_KEY)) || { coreName: 'default', queries: [], delay: 8 }; }
  catch { return { coreName: 'default', queries: [], delay: 8 }; }
}
function saveState(s) { localStorage.setItem(CORE_LS_KEY, JSON.stringify(s)); }

// Browserless function script to scrape Google search
function buildSearchScript(query) {
  return `module.exports = async ({ page }) => {
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.goto('https://www.google.com/search?q=' + encodeURIComponent(${JSON.stringify(query)}) + '&num=10', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));
  const results = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('div.g, div[data-sokoban-container]').forEach(el => {
      const titleEl = el.querySelector('h3');
      const linkEl = el.querySelector('a[href]');
      const snippetEl = el.querySelector('div[style*="-webkit-line-clamp"], span.aCOpRe, div.IsZvec span, div.VwiC3b');
      if (titleEl && linkEl) {
        const url = linkEl.href || '';
        if (!url.startsWith('http')) return;
        items.push({ title: titleEl.innerText.trim(), url, snippet: snippetEl ? snippetEl.innerText.trim() : '' });
      }
    });
    return items.slice(0, 10);
  });
  return JSON.stringify(results);
};`;
}

export default function CorePanel() {
  const blEndpoints = loadBL();
  const esEndpoints = loadES();

  const [state, setState] = useState(loadState);
  const [activeBL, setActiveBL] = useState(0);
  const [activeES, setActiveES] = useState(0);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState({ indexed: 0, queried: 0, errors: 0 });
  const [newQuery, setNewQuery] = useState('');
  const [indexStatus, setIndexStatus] = useState('unknown'); // 'unknown' | 'exists' | 'created' | 'error'
  const runningRef = useRef(false);
  const queueRef = useRef([...state.queries]);
  const logRef = useRef(null);

  // Persist state changes
  useEffect(() => { saveState(state); }, [state]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const addLog = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [...prev.slice(-199), { ts, msg, type }]);
  }, []);

  // Ensure ES index exists
  const ensureIndex = useCallback(async (esUrl, indexName) => {
    const res = await fetch(`${esUrl}/${indexName}`);
    if (res.status === 200) {
      setIndexStatus('exists');
      addLog(`Index "${indexName}" exists`, 'ok');
      return true;
    }
    if (res.status === 404) {
      const createRes = await fetch(`${esUrl}/${indexName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: {
            properties: {
              query: { type: 'keyword' },
              title: { type: 'text' },
              url: { type: 'keyword' },
              snippet: { type: 'text' },
              scraped_at: { type: 'date' },
            }
          }
        })
      });
      if (createRes.ok) {
        setIndexStatus('created');
        addLog(`Index "${indexName}" created`, 'ok');
        return true;
      }
    }
    setIndexStatus('error');
    addLog(`Failed to ensure index "${indexName}"`, 'error');
    return false;
  }, [addLog]);

  // Index documents into ES
  const indexDocs = useCallback(async (esUrl, indexName, query, docs) => {
    if (!docs || docs.length === 0) return 0;
    const bulk = docs.flatMap(d => [
      JSON.stringify({ index: { _index: indexName } }),
      JSON.stringify({ query, title: d.title, url: d.url, snippet: d.snippet, scraped_at: new Date().toISOString() })
    ]).join('\n') + '\n';
    const res = await fetch(`${esUrl}/_bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: bulk,
    });
    const json = await res.json();
    const succeeded = (json.items || []).filter(i => i.index?.result === 'created' || i.index?.status === 201).length;
    return succeeded || docs.length;
  }, []);

  // Scrape one query via Browserless
  const scrapeQuery = useCallback(async (blEp, query) => {
    const headers = { 'Content-Type': 'application/javascript', ...(blEp.token ? { Authorization: `Bearer ${blEp.token}` } : {}) };
    const res = await fetch(`${blEp.url}/function`, {
      method: 'POST',
      headers,
      body: buildSearchScript(query),
    });
    if (!res.ok) throw new Error(`BL HTTP ${res.status}`);
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = []; }
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = []; } }
    return Array.isArray(parsed) ? parsed : [];
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    addLog('Core ingestion paused', 'warn');
  }, [addLog]);

  const start = useCallback(async () => {
    if (running) return;
    const blEp = blEndpoints[activeBL];
    const esEp = esEndpoints[activeES];
    if (!blEp || !esEp) { addLog('Configure both Browserless and Elasticsearch endpoints first', 'error'); return; }

    const indexName = INDEX_PREFIX + state.coreName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const ok = await ensureIndex(esEp.url, indexName);
    if (!ok) return;

    runningRef.current = true;
    setRunning(true);
    queueRef.current = [...state.queries];
    addLog(`Core ingestion started — target: ${indexName}`, 'ok');

    const processNext = async () => {
      if (!runningRef.current) return;
      if (queueRef.current.length === 0) {
        addLog('All queries processed. Core complete.', 'ok');
        runningRef.current = false;
        setRunning(false);
        return;
      }

      const query = queueRef.current.shift();
      addLog(`Scraping: "${query}"...`, 'info');

      try {
        const docs = await scrapeQuery(blEp, query);
        addLog(`  → ${docs.length} results found`, 'info');
        if (docs.length > 0) {
          const n = await indexDocs(esEp.url, indexName, query, docs);
          addLog(`  → ${n} docs indexed`, 'ok');
          setStats(p => ({ ...p, indexed: p.indexed + n, queried: p.queried + 1 }));
        } else {
          addLog(`  → No results extracted`, 'warn');
          setStats(p => ({ ...p, queried: p.queried + 1 }));
        }
        // Remove from pending list
        setState(prev => ({ ...prev, queries: prev.queries.filter(q => q !== query) }));
      } catch (e) {
        addLog(`  → Error: ${e.message}`, 'error');
        setStats(p => ({ ...p, errors: p.errors + 1 }));
      }

      if (runningRef.current && queueRef.current.length > 0) {
        const delay = state.delay * 1000;
        addLog(`Waiting ${state.delay}s before next query...`, 'dim');
        setTimeout(processNext, delay);
      } else {
        if (runningRef.current) {
          addLog('Queue exhausted. Core complete.', 'ok');
          runningRef.current = false;
          setRunning(false);
        }
      }
    };

    processNext();
  }, [running, blEndpoints, esEndpoints, activeBL, activeES, state, ensureIndex, scrapeQuery, indexDocs, addLog]);

  const addQuery = () => {
    if (!newQuery.trim()) return;
    const q = newQuery.trim();
    if (state.queries.includes(q)) { setNewQuery(''); return; }
    const next = { ...state, queries: [...state.queries, q] };
    setState(next);
    setNewQuery('');
  };

  const removeQuery = (q) => setState(prev => ({ ...prev, queries: prev.queries.filter(x => x !== q) }));

  const indexName = INDEX_PREFIX + state.coreName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const logColors = { info: 'rgba(0,255,204,0.6)', ok: '#00cc66', warn: '#ffaa00', error: '#ff4444', dim: 'rgba(0,255,204,0.3)' };

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-4" style={{ minHeight: '80vh' }}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain size={13} style={{ color: 'var(--neon-primary)' }} />
        <span className="neon-text text-xs tracking-widest uppercase flex-1">KNOWLEDGE CORE INGESTION</span>
        <div style={{ fontSize: '0.6rem', letterSpacing: '1.5px', color: 'rgba(0,255,204,0.35)', fontFamily: 'Rajdhani, sans-serif' }}>PASSIVE · SLOW · PERMANENT</div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* LEFT — Config */}
        <div className="flex flex-col gap-3 lg:w-80">

          {/* Core name */}
          <div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>CORE NAME</div>
            <input type="text" value={state.coreName}
              onChange={e => setState(prev => ({ ...prev, coreName: e.target.value }))}
              placeholder="default"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 3, fontSize: '0.8rem', letterSpacing: '1px' }}
            />
            <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', marginTop: 4, letterSpacing: '1px' }}>
              Index: <span style={{ color: 'rgba(0,255,204,0.5)' }}>{indexName}</span>
              {indexStatus !== 'unknown' && (
                <span style={{ marginLeft: 8, color: indexStatus === 'error' ? '#ff4444' : '#00cc66' }}>
                  {indexStatus === 'exists' ? '✓ EXISTS' : indexStatus === 'created' ? '✓ CREATED' : '✗ ERROR'}
                </span>
              )}
            </div>
          </div>

          {/* BL endpoint */}
          <div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>BROWSERLESS ENDPOINT</div>
            {blEndpoints.length === 0 ? (
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,100,100,0.6)', fontFamily: 'Rajdhani, sans-serif' }}>No endpoints — configure in BROWSER tab</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {blEndpoints.map((e, i) => (
                  <button key={i} onClick={() => setActiveBL(i)}
                    style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${i === activeBL ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: i === activeBL ? 'rgba(0,255,204,0.08)' : 'transparent', color: i === activeBL ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)' }}>{e.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* ES endpoint */}
          <div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>ELASTICSEARCH ENDPOINT</div>
            {esEndpoints.length === 0 ? (
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,100,100,0.6)', fontFamily: 'Rajdhani, sans-serif' }}>No endpoints — configure in DB tab</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {esEndpoints.map((e, i) => (
                  <button key={i} onClick={() => setActiveES(i)}
                    style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${i === activeES ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: i === activeES ? 'rgba(0,255,204,0.08)' : 'transparent', color: i === activeES ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)' }}>{e.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Delay */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>SCRAPE DELAY</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--neon-primary)', fontFamily: 'Rajdhani, sans-serif' }}>{state.delay}s</span>
            </div>
            <input type="range" min={3} max={60} step={1} value={state.delay}
              onChange={e => setState(prev => ({ ...prev, delay: parseInt(e.target.value) }))}
              style={{ width: '100%' }}
            />
            <div className="flex justify-between" style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.2)', letterSpacing: '1px', marginTop: 2 }}>
              <span>3s (fast)</span><span>60s (stealth)</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[{ label: 'INDEXED', value: stats.indexed }, { label: 'QUERIED', value: stats.queried }, { label: 'ERRORS', value: stats.errors }].map(({ label, value }) => (
              <div key={label} style={{ background: 'rgba(0,255,204,0.04)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '7px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1.5px', marginBottom: 2 }}>{label}</div>
                <div style={{ color: label === 'ERRORS' && value > 0 ? '#ff4444' : 'var(--neon-primary)', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'Rajdhani, sans-serif' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Start / Stop */}
          <button
            onClick={running ? stop : start}
            disabled={state.queries.length === 0 && !running}
            className={`neon-btn ${running ? 'neon-btn-danger' : ''} px-4 py-3 rounded text-sm flex items-center justify-center gap-2 font-bold tracking-widest`}
          >
            {running ? <><Square size={13} /> STOP INGESTION</> : <><Play size={13} /> START INGESTION</>}
          </button>

          {running && (
            <div className="flex items-center gap-2" style={{ fontSize: '0.65rem', color: '#ffaa00', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
              <RefreshCw size={10} className="animate-spin" />
              CORE INGESTION ACTIVE — {state.queries.length} QUERIES REMAINING
            </div>
          )}
        </div>

        {/* RIGHT — Query queue + log */}
        <div className="flex flex-col gap-3 flex-1">

          {/* Add query */}
          <div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>SEARCH QUERY QUEUE ({state.queries.length})</div>
            <div className="flex gap-2">
              <input type="text" value={newQuery}
                onChange={e => setNewQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addQuery()}
                placeholder="Add search query..."
                style={{ flex: 1, padding: '6px 10px', borderRadius: 3, fontSize: '0.78rem' }}
              />
              <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={addQuery}>
                <Plus size={11} /> ADD
              </button>
            </div>
          </div>

          {/* Query list */}
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {state.queries.length === 0 && (
              <div style={{ fontSize: '0.7rem', color: 'rgba(0,255,204,0.2)', textAlign: 'center', padding: '20px 0', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
                NO QUERIES — ADD TOPICS TO INGEST
              </div>
            )}
            {state.queries.map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.08)', borderRadius: 3 }}>
                <span style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.2)', letterSpacing: '1px', minWidth: 20 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1, fontSize: '0.75rem', color: 'rgba(0,255,204,0.7)', fontFamily: 'Rajdhani, sans-serif' }}>{q}</span>
                <button onClick={() => removeQuery(q)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.4)', padding: '2px' }} disabled={running}>
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>

          {/* Activity log */}
          <div style={{ flex: 1, minHeight: 200 }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>ACTIVITY LOG</span>
              <button onClick={() => setLog([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.25)', fontSize: '0.6rem', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>CLEAR</button>
            </div>
            <div ref={logRef} style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '8px 10px', height: 240, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {log.length === 0 && (
                <span style={{ color: 'rgba(0,255,204,0.2)', letterSpacing: '1px' }}>Awaiting ingestion start...</span>
              )}
              {log.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'rgba(0,255,204,0.25)', flexShrink: 0 }}>{entry.ts}</span>
                  <span style={{ color: logColors[entry.type] || logColors.info }}>{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}