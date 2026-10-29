import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Brain, Play, Square, Plus, Trash2, RefreshCw } from 'lucide-react';
import KnowledgeCoreViz from './KnowledgeCoreViz';
import SearchPanel from './SearchPanel';
import SummarizePanel from './SummarizePanel';
import SchedulerPanel from './SchedulerPanel';
import CorePresets from './CorePresets';
import CoreRefiner from './CoreRefiner';
import PersonalCores from './PersonalCores';
import { base44 } from '@/api/base44Client';
import { loadEsEndpoints, ES_ACTIVE_LS_KEY, saveActiveEsEndpoint } from '@/lib/esEndpoints';
import { OLLAMA_PROXY_URL, normalizeOllamaUrl } from '@/lib/localProxies';

const BL_LS_KEY = 'tactical_browserless_endpoints';
const CORE_LS_KEY = 'tactical_knowledge_core_state';
const CORE_UI_KEY = 'tactical_core_ui';

function loadCoreUI() {
  try { return JSON.parse(localStorage.getItem(CORE_UI_KEY)) || {}; } catch { return {}; }
}
function saveCoreUI(u) { localStorage.setItem(CORE_UI_KEY, JSON.stringify(u)); }
export const INDEX_PREFIX = 'knowledge_core_';
export function coreIndexName(name) {
  return INDEX_PREFIX + String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function loadBL() {
  try { return JSON.parse(localStorage.getItem(BL_LS_KEY)) || []; } catch { return []; }
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(CORE_LS_KEY));
    return saved ? { queryExpansionEnabled: true, activePersonal: '', ...saved, embeddingUrl: normalizeOllamaUrl(saved.embeddingUrl) } : {
      activePersonal: '',
      coreName: 'default', queries: [], delay: 8,
      embeddingEnabled: false,
      embeddingUrl: OLLAMA_PROXY_URL,
      embeddingModel: 'nomic-embed-text',
      summaryModel: 'llama3:latest',
      queryExpansionEnabled: true,
    };
  } catch {
    return { activePersonal: '', coreName: 'default', queries: [], delay: 8, embeddingEnabled: false, embeddingUrl: OLLAMA_PROXY_URL, embeddingModel: 'nomic-embed-text', summaryModel: 'llama3:latest', queryExpansionEnabled: true };
  }
}
function saveState(s) { localStorage.setItem(CORE_LS_KEY, JSON.stringify(s)); }

export default function CorePanel({ aiEndpoint, aiModel }) {
  const blEndpoints = loadBL();
  const esEndpoints = loadEsEndpoints();

  const [state, setState] = useState(loadState);
  const [activeBL, setActiveBL] = useState(() => { const u = loadCoreUI(); return Math.min(u.activeBL || 0, Math.max(0, loadBL().length - 1)); });
  const blRoundRobinRef = useRef(0);
  // Follow the endpoint that is active on the DB page — one source of truth for both panels
  const [activeES, setActiveES] = useState(() => {
    const saved = parseInt(localStorage.getItem(ES_ACTIVE_LS_KEY) || '0', 10);
    return Math.min(Number.isNaN(saved) ? 0 : saved, Math.max(0, loadEsEndpoints().length - 1));
  });
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState({ indexed: 0, queried: 0, errors: 0, vectors: 0 });
  const [newQuery, setNewQuery] = useState('');
  const [refining, setRefining] = useState(null);
  const [userId, setUserId] = useState('');
  const [indexStatus, setIndexStatus] = useState('unknown');
  const [view, setView] = useState(() => loadCoreUI().view || 'ingest');
  const runningRef = useRef(false);
  const queueRef = useRef([]);
  const logRef = useRef(null);

  useEffect(() => { saveState(state); }, [state]);
  // Personal cores are stored per user, so the refiner needs the signed-in id
  useEffect(() => { base44.auth.me().then(u => setUserId(u?.id || '')).catch(() => {}); }, []);
  useEffect(() => { saveCoreUI({ activeBL, view }); }, [activeBL, view]);
  useEffect(() => { saveActiveEsEndpoint(activeES); }, [activeES]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const addLog = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [...prev.slice(-299), { ts, msg, type }]);
  }, []);

  // Expand query into synonyms + related concepts via LLM
  const expandQuery = useCallback(async (query) => {
    const ep = esEndpoints[activeES];
    if (!ep) return [query];
    const ollamaUrl = normalizeOllamaUrl(state.embeddingUrl);
    const model = state.summaryModel || 'llama3:latest';
    const prompt = `You are a search query expansion expert. Given the query "${query}", output a JSON array of 5-8 closely related search terms, synonyms, and technical concepts that would help retrieve relevant documents. Output ONLY the JSON array, no explanation. Example: ["term1","term2","term3"]`;
    const res = await fetch(`${ollamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [query];
    const expanded = JSON.parse(match[0]).filter(t => typeof t === 'string' && t.trim());
    return [query, ...expanded.slice(0, 7)];
  }, [esEndpoints, activeES, state.embeddingUrl, state.summaryModel]);

  // Generate embedding via Ollama-compatible API
  const generateEmbedding = useCallback(async (text) => {
    const res = await fetch(`${state.embeddingUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: state.embeddingModel, prompt: text }),
    });
    if (!res.ok) throw new Error(`Embedding HTTP ${res.status}`);
    const json = await res.json();
    return json.embedding || null;
  }, [state.embeddingUrl, state.embeddingModel]);

  const ensureIndex = useCallback(async (esUrl, indexName, embeddingEnabled, dims = 768) => {
    const res = await fetch(`${esUrl}/${indexName}`);
    if (res.status === 200) {
      setIndexStatus('exists');
      addLog(`Index "${indexName}" exists`, 'ok');
      return true;
    }
    if (res.status === 404) {
      const mapping = {
        mappings: {
          properties: {
            query: { type: 'keyword' },
            title: { type: 'text' },
            url: { type: 'keyword' },
            snippet: { type: 'text' },
            scraped_at: { type: 'date' },
            ...(embeddingEnabled ? { embedding: { type: 'dense_vector', dims, index: true, similarity: 'cosine' } } : {}),
          }
        }
      };
      const createRes = await fetch(`${esUrl}/${indexName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping),
      });
      if (createRes.ok) {
        setIndexStatus('created');
        addLog(`Index "${indexName}" created${embeddingEnabled ? ` (dense_vector ${dims}d)` : ''}`, 'ok');
        return true;
      }
    }
    setIndexStatus('error');
    addLog(`Failed to ensure index "${indexName}"`, 'error');
    return false;
  }, [addLog]);

  const indexDocs = useCallback(async (esUrl, indexName, query, docs) => {
    if (!docs || docs.length === 0) return 0;
    const bulk = docs.flatMap(d => [
      JSON.stringify({ index: { _index: indexName } }),
      JSON.stringify({ query, title: d.title, url: d.url, snippet: d.snippet, scraped_at: new Date().toISOString(), ...(d.embedding ? { embedding: d.embedding } : {}) })
    ]).join('\n') + '\n';
    const res = await fetch(`${esUrl}/_bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: bulk,
    });
    const json = await res.json();
    return (json.items || []).filter(i => i.index?.result === 'created' || i.index?.status === 201).length || docs.length;
  }, []);

  // Discover all ES indices excluding knowledge_core_ prefix
  const getSourceIndices = useCallback(async (esUrl) => {
    const res = await fetch(`${esUrl}/_cat/indices?format=json&h=index`);
    if (!res.ok) throw new Error(`_cat/indices HTTP ${res.status}`);
    const json = await res.json();
    return json
      .map(i => i.index)
      // Skip generated cores (knowledge_core_*) and user personal cores (<preset>_core_<user id>)
      .filter(name => !name.startsWith(INDEX_PREFIX) && !name.startsWith('.') && !/_core_/.test(name));
  }, []);

  // Search across all source indices for a query term — wide net, up to 200 hits
  const searchESIndices = useCallback(async (esUrl, indices, query) => {
    if (indices.length === 0) return [];
    const indexPattern = indices.join(',');
    const body = {
      size: 10000,
      query: {
        query_string: {
          query: query,
          default_operator: 'OR',
          fuzziness: 'AUTO',
        },
      },
      _source: true,
    };
    const res = await fetch(`${esUrl}/${indexPattern}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`_search HTTP ${res.status}`);
    const json = await res.json();
    return (json.hits?.hits || []).map(hit => {
      const src = hit._source || {};
      // Normalise to knowledge_core schema — pick best available fields
      const title = src.title || src.name || src.subject || src.headline || hit._id || '';
      const url = src.url || src.link || src.source || src.uri || `es://${hit._index}/${hit._id}`;
      const snippet = (src.snippet || src.content || src.body || src.text || src.description || src.summary || '')
        .toString().slice(0, 300);
      return { title: String(title).slice(0, 200), url: String(url).slice(0, 500), snippet, _index: hit._index };
    }).filter(d => d.title);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    addLog('Core ingestion paused', 'warn');
  }, [addLog]);

  const start = useCallback(async () => {
    if (running) return;
    const esEp = esEndpoints[activeES];
    if (!esEp) { addLog('Configure an Elasticsearch endpoint first', 'error'); return; }

    const indexName = state.activePersonal || coreIndexName(state.coreName);

    // Auto-detect the embedding dimension from the model so the mapping always matches
    let dims = 768;
    if (state.embeddingEnabled) {
      try {
        const probe = await generateEmbedding('dimension probe');
        if (probe?.length) { dims = probe.length; addLog(`Embedding dimensions auto-detected: ${dims}`, 'ok'); }
      } catch (e) {
        addLog(`Dimension probe failed (${e.message}) — defaulting to 768`, 'warn');
      }
    }

    const ok = await ensureIndex(esEp.url, indexName, state.embeddingEnabled, dims);
    if (!ok) return;

    // Discover source indices once
    let sourceIndices = [];
    try {
      sourceIndices = await getSourceIndices(esEp.url);
      addLog(`Source indices discovered: ${sourceIndices.length} (excl. knowledge_core_*)`, 'ok');
      if (sourceIndices.length === 0) { addLog('No source indices found — nothing to ingest', 'error'); return; }
    } catch (e) { addLog(`Failed to discover indices: ${e.message}`, 'error'); return; }

    runningRef.current = true;
    setRunning(true);
    queueRef.current = [...state.queries];
    addLog(`Core ingestion started — target: ${indexName}`, 'ok');
    if (state.embeddingEnabled) addLog(`Embeddings ON — model: ${state.embeddingModel}`, 'ok');

    const processNext = async () => {
      if (!runningRef.current) return;
      if (queueRef.current.length === 0) {
        addLog('All queries processed. Core complete.', 'ok');
        runningRef.current = false;
        setRunning(false);
        return;
      }

      const query = queueRef.current.shift();

      // Query expansion via LLM
      let searchTerms = [query];
      if (state.queryExpansionEnabled) {
        addLog(`Expanding query: "${query}" via LLM...`, 'dim');
        try {
          searchTerms = await expandQuery(query);
          addLog(`  → ${searchTerms.length} terms: ${searchTerms.slice(1).map(t => `"${t}"`).join(', ')}`, 'dim');
        } catch (e) {
          addLog(`  → Expansion failed (${e.message}), using original`, 'warn');
        }
      }

      addLog(`Searching ES wide-net: "${query}" (${searchTerms.length} terms)...`, 'info');

      try {
        // Build combined query_string from all expanded terms
        const combinedQuery = searchTerms.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
        const docs = await searchESIndices(esEp.url, sourceIndices, combinedQuery);
        addLog(`  → ${docs.length} results found`, 'info');

        if (docs.length > 0) {
          // Generate embeddings if enabled
          if (state.embeddingEnabled) {
            addLog(`  → Generating embeddings...`, 'dim');
            let vecCount = 0;
            for (const doc of docs) {
              try {
                const text = `${doc.title} ${doc.snippet}`.trim();
                doc.embedding = await generateEmbedding(text);
                if (doc.embedding) vecCount++;
              } catch (e) {
                addLog(`  → Embedding failed: ${e.message}`, 'warn');
              }
            }
            addLog(`  → ${vecCount}/${docs.length} vectors generated`, 'ok');
            setStats(p => ({ ...p, vectors: p.vectors + vecCount }));
          }

          const n = await indexDocs(esEp.url, indexName, query, docs);
          addLog(`  → ${n} docs indexed`, 'ok');
          setStats(p => ({ ...p, indexed: p.indexed + n, queried: p.queried + 1 }));
        } else {
          addLog(`  → No results extracted`, 'warn');
          setStats(p => ({ ...p, queried: p.queried + 1 }));
        }

        setState(prev => ({ ...prev, queries: prev.queries.filter(q => q !== query) }));
      } catch (e) {
        addLog(`  → Error: ${e.message}`, 'error');
        setStats(p => ({ ...p, errors: p.errors + 1 }));
      }

      if (runningRef.current && queueRef.current.length > 0) {
        setTimeout(processNext, state.delay * 1000);
      } else if (runningRef.current) {
        addLog('Queue exhausted. Core complete.', 'ok');
        runningRef.current = false;
        setRunning(false);
      }
    };

    processNext();
  }, [running, esEndpoints, activeES, state, ensureIndex, getSourceIndices, searchESIndices, indexDocs, generateEmbedding, addLog]);

  const addQuery = () => {
    if (!newQuery.trim()) return;
    const q = newQuery.trim();
    if (state.queries.includes(q)) { setNewQuery(''); return; }
    setState(prev => ({ ...prev, queries: [...prev.queries, q] }));
    setNewQuery('');
  };
  const removeQuery = (q) => setState(prev => ({ ...prev, queries: prev.queries.filter(x => x !== q) }));

  // Selecting a preset opens the refiner — a message turns it into a refined personal core
  const applyPreset = useCallback((preset) => {
    setState(prev => ({ ...prev, coreName: preset.name, activePersonal: '' }));
    setRefining(preset);
    addLog(`Preset "${preset.label}" selected — refine it into a personal core`, 'dim');
  }, [addLog]);

  const applyRefinedQueries = useCallback((keywords) => {
    setState(prev => ({ ...prev, queries: [...new Set([...keywords, ...prev.queries])] }));
    addLog(`${keywords.length} refined keywords added to the query queue`, 'ok');
  }, [addLog]);
  const indexName = state.activePersonal || coreIndexName(state.coreName);
  const logColors = { info: 'rgba(0,255,204,0.6)', ok: '#00cc66', warn: '#ffaa00', error: '#ff4444', dim: 'rgba(0,255,204,0.3)' };
  const esEp = esEndpoints[activeES];

  // The target index state resolves itself — no ingestion run needed to find out
  useEffect(() => {
    if (!esEp?.url) { setIndexStatus('unknown'); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${esEp.url}/${indexName}`);
        setIndexStatus(res.status === 200 ? 'exists' : res.status === 404 ? 'missing' : 'error');
      } catch { setIndexStatus('error'); }
    }, 400);
    return () => clearTimeout(t);
  }, [esEp?.url, indexName]);

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-4" style={{ minHeight: '80vh' }}>
      {/* Header + view toggle */}
      <div className="flex items-center gap-2">
        <Brain size={13} style={{ color: 'var(--neon-primary)' }} />
        <span className="neon-text text-xs tracking-widest uppercase flex-1">KNOWLEDGE CORE</span>
        <div className="flex gap-1 flex-wrap">
          {[{ id: 'ingest', label: '⬡ INGEST' }, { id: 'search', label: '◈ SEARCH' }, { id: 'summarize', label: '⬟ SUMMARIZE' }, { id: 'schedule', label: '◷ SCHEDULE' }, { id: 'viz', label: '▦ VISUALIZE' }].map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px', padding: '3px 10px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${view === v.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: view === v.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: view === v.id ? 'rgba(0,255,204,0.07)' : 'transparent' }}>{v.label}</button>
          ))}
        </div>
      </div>

      {view === 'viz' && (
        <KnowledgeCoreViz esEndpoints={esEndpoints} activeES={activeES} onSelectES={setActiveES} />
      )}

      {view === 'search' && (
        <SearchPanel
          esEndpoints={esEndpoints}
          activeES={activeES}
          embeddingUrl={state.embeddingUrl}
          embeddingModel={state.embeddingModel}
          summaryModel={state.summaryModel}
          embeddingEnabled={state.embeddingEnabled}
        />
      )}

      {view === 'summarize' && (
        <SummarizePanel
          esEndpoints={esEndpoints}
          activeES={activeES}
          ollamaEndpoint={state.embeddingUrl}
          ollamaModel={state.summaryModel}
          onModelChange={(m) => setState(prev => ({ ...prev, summaryModel: m }))}
        />
      )}

      {view === 'schedule' && (
        <SchedulerPanel
          availableQueries={state.queries}
          onTriggerScrape={(query) => {
            setState(prev => ({
              ...prev,
              queries: prev.queries.includes(query) ? prev.queries : [...prev.queries, query]
            }));
            addLog(`[SCHEDULER] Auto-queued: "${query}"`, 'ok');
          }}
        />
      )}

      {view === 'ingest' && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* LEFT — Config */}
          <div className="flex flex-col gap-3 lg:w-80">

            <CorePresets activeCoreName={state.coreName} onSelect={applyPreset} />

            <PersonalCores
              esUrl={esEp?.url}
              userId={userId}
              onQueue={applyRefinedQueries}
              onSelectCore={(index) => {
                setState(prev => ({ ...prev, activePersonal: index }));
                addLog(`Current core → personal ${index}`, 'ok');
              }}
              log={addLog}
            />

            {refining && (
              <CoreRefiner
                preset={refining}
                esUrl={esEp?.url}
                ollamaUrl={aiEndpoint || state.embeddingUrl}
                model={aiModel || state.summaryModel}
                userId={userId}
                onApply={applyRefinedQueries}
                onClose={() => setRefining(null)}
                log={addLog}
              />
            )}

            {/* Core name */}
            <div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>CORE NAME</div>
              <input type="text" value={state.coreName}
                onChange={e => setState(prev => ({ ...prev, coreName: e.target.value, activePersonal: '' }))}
                placeholder="default"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 3, fontSize: '0.8rem', letterSpacing: '1px' }}
              />              <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', marginTop: 4, letterSpacing: '1px' }}>
                Index: <span style={{ color: 'rgba(0,255,204,0.5)' }}>{indexName}</span>
                {indexStatus !== 'unknown' && (
                  <span style={{ marginLeft: 8, color: indexStatus === 'error' ? '#ff4444' : indexStatus === 'missing' ? 'rgba(0,255,204,0.4)' : '#00cc66' }}>
                    {indexStatus === 'exists' ? '✓ EXISTS' : indexStatus === 'created' ? '✓ CREATED' : indexStatus === 'missing' ? '○ NOT BUILT' : '✗ ERROR'}
                  </span>
                )}
              </div>
              {state.activePersonal && (
                <div className="flex items-center gap-2" style={{ marginTop: 6, padding: '4px 7px', borderRadius: 3, background: 'rgba(0,255,204,0.06)', border: '1px solid rgba(0,255,204,0.2)' }}>
                  <span style={{ flex: 1, fontSize: '0.56rem', color: 'var(--neon-primary)', letterSpacing: '1.2px' }}>
                    ◈ PERSONAL CORE ACTIVE
                  </span>
                  <button
                    onClick={() => { setState(prev => ({ ...prev, activePersonal: '' })); addLog('Current core → named core', 'dim'); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.58rem', letterSpacing: '1px' }}>
                    ✕ CLEAR
                  </button>
                </div>
              )}
            </div>

            {/* ES endpoint */}
            <div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>ELASTICSEARCH</div>
              {esEndpoints.length === 0 ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,100,100,0.6)', fontFamily: 'Rajdhani, sans-serif' }}>Configure in DB tab</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {esEndpoints.map((e, i) => (
                    <button key={i} onClick={() => setActiveES(i)}
                      style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${i === activeES ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: i === activeES ? 'rgba(0,255,204,0.08)' : 'transparent', color: i === activeES ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)' }}>{e.label}</button>
                  ))}
                </div>
              )}
              {esEp?.url && (
                <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.25)', marginTop: 4, letterSpacing: '1px', wordBreak: 'break-all' }}>
                  ACTIVE DB: <span style={{ color: 'rgba(0,255,204,0.5)' }}>{esEp.url}</span>
                </div>
              )}
            </div>

            {/* Query Expansion config */}
            <div style={{ background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '10px 12px' }}>
              <div className="flex items-center justify-between">
                <div>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '2px' }}>LLM QUERY EXPANSION</span>
                  <div style={{ fontSize: '0.56rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px', marginTop: 2 }}>Expands queries into synonyms &amp; related concepts</div>
                </div>
                <button
                  onClick={() => setState(prev => ({ ...prev, queryExpansionEnabled: !prev.queryExpansionEnabled }))}
                  style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '1.5px', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', flexShrink: 0, border: `1px solid ${state.queryExpansionEnabled ? '#00cc66' : 'rgba(0,255,204,0.2)'}`, color: state.queryExpansionEnabled ? '#00cc66' : 'rgba(0,255,204,0.35)', background: state.queryExpansionEnabled ? 'rgba(0,204,102,0.08)' : 'transparent' }}>
                  {state.queryExpansionEnabled ? '● ON' : '○ OFF'}
                </button>
              </div>
            </div>

            {/* Embedding config */}
            <div style={{ background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '10px 12px' }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '2px' }}>VECTOR EMBEDDINGS</span>
                <button
                  onClick={() => setState(prev => ({ ...prev, embeddingEnabled: !prev.embeddingEnabled }))}
                  style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '1.5px', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${state.embeddingEnabled ? '#00cc66' : 'rgba(0,255,204,0.2)'}`, color: state.embeddingEnabled ? '#00cc66' : 'rgba(0,255,204,0.35)', background: state.embeddingEnabled ? 'rgba(0,204,102,0.08)' : 'transparent' }}>
                  {state.embeddingEnabled ? '● ON' : '○ OFF'}
                </button>
              </div>
              {state.embeddingEnabled && (
                <div className="flex flex-col gap-2">
                  <div>
                    <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', marginBottom: 3 }}>OLLAMA URL</div>
                    <input type="text" value={state.embeddingUrl}
                      onChange={e => setState(prev => ({ ...prev, embeddingUrl: e.target.value }))}
                      style={{ width: '100%', padding: '4px 8px', borderRadius: 3, fontSize: '0.7rem' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', marginBottom: 3 }}>MODEL</div>
                    <input type="text" value={state.embeddingModel}
                      onChange={e => setState(prev => ({ ...prev, embeddingModel: e.target.value }))}
                      placeholder="nomic-embed-text"
                      style={{ width: '100%', padding: '4px 8px', borderRadius: 3, fontSize: '0.7rem' }}
                    />
                  </div>
                  <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px' }}>
                    Stores dense_vector (768d) — enables semantic kNN search
                  </div>
                </div>
              )}
            </div>

            {/* Delay */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>BATCH DELAY</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--neon-primary)', fontFamily: 'Rajdhani, sans-serif' }}>{state.delay}s</span>
              </div>
              <input type="range" min={3} max={60} step={1} value={state.delay}
                onChange={e => setState(prev => ({ ...prev, delay: parseInt(e.target.value) }))}
                style={{ width: '100%' }}
              />
              <div className="flex justify-between" style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.2)', letterSpacing: '1px', marginTop: 2 }}>
                <span>3s</span><span>60s stealth</span>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {[
                { label: 'INDEXED', value: stats.indexed },
                { label: 'QUERIED', value: stats.queried },
                { label: 'VECTORS', value: stats.vectors },
                { label: 'ERRORS', value: stats.errors },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(0,255,204,0.04)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '7px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1.5px', marginBottom: 2 }}>{label}</div>
                  <div style={{ color: label === 'ERRORS' && value > 0 ? '#ff4444' : label === 'VECTORS' ? '#7eb8ff' : 'var(--neon-primary)', fontSize: '1rem', fontWeight: 700, fontFamily: 'Rajdhani, sans-serif' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Start/Stop */}
            <button onClick={running ? stop : start}
              disabled={(state.queries.length === 0 || !esEndpoints[activeES]) && !running}
              className={`neon-btn ${running ? 'neon-btn-danger' : ''} px-4 py-3 rounded text-sm flex items-center justify-center gap-2 font-bold tracking-widest`}>
              {running ? <><Square size={13} /> STOP INGESTION</> : <><Play size={13} /> START INGESTION</>}
            </button>

            {running && (
              <div className="flex items-center gap-2" style={{ fontSize: '0.65rem', color: '#ffaa00', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
                <RefreshCw size={10} className="animate-spin" />
                ACTIVE — {state.queries.length} REMAINING
              </div>
            )}
          </div>

          {/* RIGHT — Query queue + log */}
          <div className="flex flex-col gap-3 flex-1">
            <div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>QUERY QUEUE ({state.queries.length})</div>
              <div className="flex gap-2">
                <input type="text" value={newQuery}
                  onChange={e => setNewQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addQuery()}
                  placeholder="Add search term (e.g. 'malware analysis')..."
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 3, fontSize: '0.78rem' }}
                />
                <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={addQuery}>
                  <Plus size={11} /> ADD
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {state.queries.length === 0 && (
                <div style={{ fontSize: '0.7rem', color: 'rgba(0,255,204,0.2)', textAlign: 'center', padding: '20px 0', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>NO QUERIES PENDING</div>
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
            <div style={{ flex: 1 }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>ACTIVITY LOG</span>
                <button onClick={() => setLog([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.25)', fontSize: '0.6rem', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>CLEAR</button>
              </div>
              <div ref={logRef} style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '8px 10px', height: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {log.length === 0 && <span style={{ color: 'rgba(0,255,204,0.2)', letterSpacing: '1px' }}>Awaiting ingestion start...</span>}
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
      )}
    </div>
  );
}