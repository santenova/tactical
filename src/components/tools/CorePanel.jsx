import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Brain, Play, Square, Plus, Trash2, RefreshCw, Layers } from 'lucide-react';
import KnowledgeCoreViz from './KnowledgeCoreViz';
import SearchPanel from './SearchPanel';
import SummarizePanel from './SummarizePanel';
import SchedulerPanel from './SchedulerPanel';
import CorePresets from './CorePresets';
import CoreRefiner from './CoreRefiner';
import PersonalCores from './PersonalCores';
import CoreQuickSearch from './CoreQuickSearch';
import { client } from '@/apis/client';
import { loadEsEndpoints, ES_ACTIVE_LS_KEY, saveActiveEsEndpoint } from '@/lib/esEndpoints';
import { OLLAMA_PROXY_URL, normalizeOllamaUrl } from '@/lib/localProxies';
import { safeSetItem } from '@/lib/safeStorage';
import { loadPresets } from '@/lib/knowledgePresets';
import { embedText } from '@/lib/embeddings';
import { ensureEmbeddingField, readEmbeddingField, readEmbeddingFieldRaw, MAPPING_VARIANTS } from '@/lib/esMapping';
import { extractKeywords } from './MemoryInspector';

const BL_LS_KEY = 'tactical_browserless_endpoints';
const CORE_LS_KEY = 'tactical_knowledge_core_state';
const CORE_UI_KEY = 'tactical_core_ui';

function loadCoreUI() {
  try { return JSON.parse(localStorage.getItem(CORE_UI_KEY)) || {}; } catch { return {}; }
}
function saveCoreUI(u) { safeSetItem(CORE_UI_KEY, JSON.stringify(u)); }
export const INDEX_PREFIX = 'knowledge_core_';
export function coreIndexName(name) {
  return INDEX_PREFIX + String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_');
}
// The vector field every core needs for semantic search — quantized HNSW, cosine
export const EMBEDDING_DIMS = 384;
export function embeddingMapping(dims = EMBEDDING_DIMS) {
  return {
    type: 'dense_vector',
    dims,
    index: true,
    similarity: 'cosine',
    index_options: { type: 'int8_hnsw', m: 16, ef_construction: 100 },
  };
}

function loadBL() {
  try { return JSON.parse(localStorage.getItem(BL_LS_KEY)) || []; } catch { return []; }
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(CORE_LS_KEY));
    return saved ? { queryExpansionEnabled: true, activePersonal: '', resultLimit: 10000, ...saved, embeddingUrl: normalizeOllamaUrl(saved.embeddingUrl) } : {
      activePersonal: '',
      coreName: 'default', queries: [], delay: 8, resultLimit: 10000,
      embeddingEnabled: false,
      embeddingUrl: OLLAMA_PROXY_URL,
      embeddingModel: 'nomic-embed-text',
      summaryModel: 'llama3:latest',
      queryExpansionEnabled: true,
      autoApproveMapping: true,
    };
  } catch {
    return { activePersonal: '', coreName: 'default', queries: [], delay: 8, resultLimit: 10000, embeddingEnabled: false, embeddingUrl: OLLAMA_PROXY_URL, embeddingModel: 'nomic-embed-text', summaryModel: 'llama3:latest', queryExpansionEnabled: true, autoApproveMapping: true };
  }
}
function saveState(s) { safeSetItem(CORE_LS_KEY, JSON.stringify(s)); }

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
  const [patching, setPatching] = useState(false);
  const [userId, setUserId] = useState('');
  const [indexStatus, setIndexStatus] = useState('unknown');
  // Whether the current core actually carries the vector field in its mapping
  const [vectorField, setVectorField] = useState(null);
  const [mappingTick, setMappingTick] = useState(0);
  // Models the host actually serves, so the embedding model is picked, not typed
  const [embedModels, setEmbedModels] = useState([]);
  // The cluster's own reason for refusing the vector field, shown under the core name
  const [mappingError, setMappingError] = useState('');
  const [view, setView] = useState(() => loadCoreUI().view || 'ingest');
  const runningRef = useRef(false);
  // url → { …doc, tags: Set } for the current run, so tags accumulate across queries
  const runDocsRef = useRef(new Map());
  const logRef = useRef(null);

  useEffect(() => { saveState(state); }, [state]);
  // Personal cores are stored per user, so the refiner needs the signed-in id
  useEffect(() => { client.auth.me().then(u => setUserId(u?.id || '')).catch(() => {}); }, []);
  useEffect(() => { saveCoreUI({ activeBL, view }); }, [activeBL, view]);
  useEffect(() => { saveActiveEsEndpoint(activeES); }, [activeES]);
  // OpenAI-style model list — the same route the other panels read
  useEffect(() => {
    if (!state.embeddingEnabled) return;
    let cancelled = false;
    fetch(`${normalizeOllamaUrl(state.embeddingUrl)}/v1/models`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled) return;
        // Only embedding models — chat models answer on a different route and return no vector
        const names = (j?.data || [])
          .map(m => m?.id)
          .filter(n => n && /embed|bge|gte|e5|minilm|mpnet|jina|nomic|mxbai|arctic|voyage|sentence-transformer/i.test(n));
        setEmbedModels(names);
      })
      .catch(() => { if (!cancelled) setEmbedModels([]); });
    return () => { cancelled = true; };
  }, [state.embeddingEnabled, state.embeddingUrl]);
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
    // Both halves matter: the synonyms catch the same idea worded differently, the
    // branches catch the specific forms a topic takes (query "astronomy" → radio
    // astronomy, amateur astronomy, astrophotography...), which share no wording with it
    const prompt = `You are a search query expansion expert. Given the topic "${query}", return a JSON object with a "terms" array of 10-14 search terms in two groups:
1. SYNONYMS & RELATED CONCEPTS — 4-6 terms that say the same thing differently.
2. TYPES & SUB-FIELDS — 6-8 named branches, varieties, specialisms or disciplines of this exact topic, the way practitioners actually name them (for "astronomy": "radio astronomy", "amateur astronomy", "astrophotography", "observational astronomy", "stellar astrophysics"). These must be concrete established terms, not generic words like "advanced" or "introduction".
Format: {"terms": ["term1", "term2", "term3"]}`;
    // Strict OpenAI-compatible request: chat completions with a JSON response format,
    // so the answer is a parsed object instead of text that has to be scraped
    const res = await fetch(`${ollamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || '';
    let parsed;
    try { parsed = JSON.parse(text); } catch { return [query]; }
    // Every group the model returned is read in order — a flat "terms" array, separate
    // synonym / sub-field arrays, or a bare list. Group one is kept first and on its own,
    // so a missing, nested or malformed second group can never wipe or displace it.
    const collect = (node, out) => {
      if (Array.isArray(node)) node.forEach(v => collect(v, out));
      else if (typeof node === 'string') out.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(v => collect(v, out));
      return out;
    };
    // Query-syntax characters are stripped from every term, so one bad term from a later
    // group cannot make the whole combined query_string fail and take group one with it
    const clean = (t) => String(t)
      .replace(/["\\()\[\]{}:^~!+?*/|&<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const expanded = collect(parsed, []).map(clean).filter(Boolean);
    const terms = [...new Set(expanded)].slice(0, 14);
    if (terms.length === 0) return [query];
    return [query, ...terms];
  }, [esEndpoints, activeES, state.embeddingUrl, state.summaryModel]);

  // Generate embedding via Ollama-compatible API
  const generateEmbedding = useCallback(
    (text) => embedText(state.embeddingUrl, state.embeddingModel, text),
    [state.embeddingUrl, state.embeddingModel]
  );

  // Adds the vector field to every existing core that lacks it — a core without it can
  // never answer a semantic query, and adding it never touches the stored documents
  const patchAllCores = useCallback(async () => {
    const esUrl = esEndpoints[activeES]?.url;
    if (!esUrl) { addLog('Configure an Elasticsearch endpoint first', 'error'); return; }
    setPatching(true);
    try {
      let dims = EMBEDDING_DIMS;
      try {
        const probe = await generateEmbedding('dimension probe');
        if (probe?.length) dims = probe.length;
      } catch {}
      const listRes = await fetch(`${esUrl}/_cat/indices/${INDEX_PREFIX}*?format=json&h=index`);
      if (!listRes.ok) throw new Error(`_cat/indices HTTP ${listRes.status}`);
      const names = (await listRes.json()).map(i => i.index);
      addLog(`Scanning ${names.length} core${names.length === 1 ? '' : 's'} for the embedding field (${dims}d)...`, 'info');
      let patched = 0;
      for (const name of names) {
        const r = await ensureEmbeddingField(esUrl, name, dims);
        if (r.existing) {
          addLog(`  ${name} — already stores vectors${r.existing.dims ? ` (${r.existing.dims}d)` : ''}`, 'dim');
          continue;
        }
        if (r.ok) { patched++; addLog(`  ${name} — embedding field added (${dims}d, ${r.mode})`, 'ok'); }
        else addLog(`  ${name} — mapping rejected: ${r.error}`, 'error');
      }
      addLog(`Mapping repair complete — ${patched} of ${names.length} cores updated`, patched ? 'ok' : 'warn');
    } catch (e) {
      addLog(`Mapping repair failed: ${e.message}`, 'error');
    } finally {
      setPatching(false);
    }
  }, [esEndpoints, activeES, generateEmbedding, addLog]);

  // Creates the core if needed, then guarantees the vector field. The field goes into the
  // FIRST create request whenever embeddings are on: Elasticsearch would otherwise auto-map
  // the name as a float array on the first vector write, and that mapping can never be
  // changed into a dense_vector again — the core would look fine yet hold no usable vectors.
  const ensureIndex = useCallback(async (esUrl, indexName, embeddingEnabled, dims = EMBEDDING_DIMS) => {
    const res = await fetch(`${esUrl}/${indexName}`);
    let created = false;
    let inlineMode = '';

    const baseProps = {
      query: { type: 'keyword' },
      tags: { type: 'keyword' },
      title: { type: 'text' },
      url: { type: 'keyword' },
      snippet: { type: 'text' },
      scraped_at: { type: 'date' },
    };
    const createIndex = (properties) => fetch(`${esUrl}/${indexName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: { properties } }),
    });

    if (res.status === 404) {
      const wantVector = embeddingEnabled && state.autoApproveMapping !== false;
      let createRes = null;
      if (wantVector) {
        for (const { label, mapping } of MAPPING_VARIANTS(dims)) {
          createRes = await createIndex({ ...baseProps, embedding: mapping });
          if (createRes.ok) { created = true; inlineMode = label; break; }
        }
      }
      // No vector accepted (or not requested) — create the text core, then add the field
      if (!created) {
        createRes = await createIndex(baseProps);
        if (createRes.ok) created = true;
        else {
          setIndexStatus('error');
          addLog(`Failed to create index "${indexName}" (HTTP ${createRes.status})`, 'error');
          return false;
        }
      }
      if (inlineMode) addLog(`Vector field stored with the core on creation (${dims}d, ${inlineMode})`, 'ok');
    } else if (res.status !== 200) {
      setIndexStatus('error');
      addLog(`Failed to ensure index "${indexName}" (HTTP ${res.status})`, 'error');
      return false;
    }

    if (embeddingEnabled && state.autoApproveMapping === false) {
      addLog(`Mapping for "${indexName}" awaits confirmation — approve it with ◈ NO VEC FIELD — ADD IT beside the core name`, 'warn');
    } else if (embeddingEnabled && !inlineMode) {
      // A name already claimed by another type can't be repaired — say so instead of
      // silently leaving a core that will never answer a semantic query
      const raw = await readEmbeddingFieldRaw(esUrl, indexName);
      if (raw && raw.type !== 'dense_vector') {
        const msg = `"${indexName}" holds "embedding" as type ${raw.type} — an earlier vector write auto-mapped it. Delete this core and ingest it again.`;
        setMappingError(msg);
        addLog(msg, 'error');
        setIndexStatus(created ? 'created' : 'exists');
        return false;
      }
      const r = await ensureEmbeddingField(esUrl, indexName, dims);
      if (r.existing) {
        if (r.existing.dims && r.existing.dims !== dims) {
          addLog(`Index "${indexName}" stores ${r.existing.dims}d vectors but the model returns ${dims}d — vectors will be rejected, build a fresh core`, 'warn');
        }
      } else if (r.ok) {
        setMappingError('');
        addLog(`Embedding field ready on "${indexName}" (${dims}d, ${r.mode})`, 'ok');
      } else {
        setMappingError(r.error);
        addLog(`Embedding field NOT added to "${indexName}": ${r.error}`, 'error');
      }
    }

    setIndexStatus(created ? 'created' : 'exists');
    addLog(`Index "${indexName}" ${created ? 'created' : 'exists'}`, 'ok');
    return true;
  }, [addLog, state.autoApproveMapping]);

  // The three strongest words of a snippet — most frequent first, longer words winning
  // ties — so every document carries a few of its own topic tags
  const topSnippetKeywords = (text, n = 3) => {
    const src = String(text || '').toLowerCase();
    if (!src) return [];
    const counts = new Map();
    for (const w of src.match(/\b\w{3,}\b/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
    return extractKeywords(src)
      .sort((a, b) => (counts.get(b) - counts.get(a)) || b.length - a.length)
      .slice(0, n);
  };

  // A doc id comes from its url, so a document matched by several preset queries is
  // updated in place — one document carrying every tag, not one copy per query
  const docId = (d) => {
    const s = String(d.url || d.title || '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'doc_' + (h >>> 0).toString(36);
  };

  const indexDocs = useCallback(async (esUrl, indexName, docs) => {
    if (!docs || docs.length === 0) return 0;
    const bulk = docs.flatMap(d => [
      JSON.stringify({ index: { _index: indexName, _id: docId(d) } }),
      JSON.stringify({
        query: d.tags?.[0] || '',
        tags: d.tags || [],
        title: d.title,
        url: d.url,
        snippet: d.snippet,
        scraped_at: new Date().toISOString(),
        ...(d.embedding ? { embedding: d.embedding } : {}),
      })
    ]).join('\n') + '\n';
    const res = await fetch(`${esUrl}/_bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: bulk,
    });
    const json = await res.json();
    const items = (json.items || []).map(i => i.index || i.create || i.update || {});
    const ok = items.filter(i => i.status >= 200 && i.status < 300).length;
    const failed = items.filter(i => i.status >= 300);
    // A rejected write is reported, never counted as success — a core that silently
    // drops its documents looks populated while holding nothing
    const reason = failed[0]?.error?.reason || failed[0]?.error?.type || (res.ok ? '' : `HTTP ${res.status}`);
    return { ok, failed: failed.length, reason };
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

  // Search across all source indices for a query term — wide net, capped by the result limit
  const searchESIndices = useCallback(async (esUrl, indices, query, limit = 10000) => {
    if (indices.length === 0) return [];
    const indexPattern = indices.join(',');
    const body = {
      size: Math.min(Math.max(parseInt(limit, 10) || 10000, 1), 10000),
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

  // One core's worth of work — every query in the list searched, tagged, embedded and
  // indexed into the given index, stopping early when ingestion is paused
  const ingestCore = useCallback(async (esUrl, indexName, queries, sourceIndices) => {
    const queue = [...queries];
    runDocsRef.current = new Map();

    while (runningRef.current && queue.length > 0) {
      const query = queue.shift();

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
        const docs = await searchESIndices(esUrl, sourceIndices, combinedQuery, state.resultLimit);
        addLog(`  → ${docs.length} results found`, 'info');

        if (docs.length > 0) {
          // Each doc keeps every preset query that matched it — a doc hit by several
          // queries stays one document whose tags array holds all of them
          const touched = [];
          for (const doc of docs) {
            const key = doc.url || doc.title;
            const seen = runDocsRef.current.get(key);
            if (seen) { seen.tags.add(query); touched.push(seen); }
            else {
              // The query plus the snippet's own top keywords become the doc's tags
              const rec = { ...doc, tags: new Set([query, ...topSnippetKeywords(doc.snippet)]) };
              runDocsRef.current.set(key, rec);
              touched.push(rec);
            }
          }
          const multi = touched.filter(d => d.tags.size > 1).length;
          addLog(`  → ${touched.length} docs tagged "${query}"${multi ? ` (${multi} already tagged)` : ''}`, 'info');

          // Generate embeddings if enabled
          if (state.embeddingEnabled) {
            addLog(`  → Generating embeddings...`, 'dim');
            let vecCount = 0;
            for (const doc of touched) {
              try {
                // The tags join the embedding text, so a document is reachable by every
                // preset topic it matched, not only by its own wording
                const text = [doc.title, doc.snippet, [...doc.tags].join(', ')].filter(Boolean).join(' — ');
                doc.embedding = await generateEmbedding(text);
                if (doc.embedding) vecCount++;
              } catch (e) {
                addLog(`  → Embedding failed: ${e.message}`, 'warn');
              }
            }
            addLog(`  → ${vecCount}/${touched.length} vectors generated`, 'ok');
            setStats(p => ({ ...p, vectors: p.vectors + vecCount }));
          }

          const bulk = await indexDocs(esUrl, indexName, touched.map(d => ({ ...d, tags: [...d.tags] })));
          if (bulk.ok) addLog(`  → ${bulk.ok} docs indexed`, 'ok');
          if (bulk.failed) {
            addLog(`  → ${bulk.failed} docs REJECTED${bulk.reason ? `: ${bulk.reason}` : ''}`, 'error');
            setStats(p => ({ ...p, errors: p.errors + bulk.failed }));
          }
          if (bulk.ok || bulk.failed) setStats(p => ({ ...p, indexed: p.indexed + bulk.ok, queried: p.queried + 1 }));
        } else {
          addLog(`  → No results extracted`, 'warn');
          setStats(p => ({ ...p, queried: p.queried + 1 }));
        }

        setState(prev => ({ ...prev, queries: prev.queries.filter(q => q !== query) }));
      } catch (e) {
        addLog(`  → Error: ${e.message}`, 'error');
        setStats(p => ({ ...p, errors: p.errors + 1 }));
      }

      if (runningRef.current && queue.length > 0) {
        await new Promise(r => setTimeout(r, state.delay * 1000));
      }
    }
  }, [state.queryExpansionEnabled, state.embeddingEnabled, state.resultLimit, state.delay, expandQuery, searchESIndices, indexDocs, generateEmbedding, addLog]);

  // Resolves the embedding width once per run, falling back to the default
  const probeDims = useCallback(async () => {
    if (!state.embeddingEnabled) return EMBEDDING_DIMS;
    try {
      const probe = await generateEmbedding('dimension probe');
      if (probe?.length) { addLog(`Embedding dimensions auto-detected: ${probe.length}`, 'ok'); return probe.length; }
    } catch (e) {
      addLog(`Dimension probe failed (${e.message}) — defaulting to ${EMBEDDING_DIMS}`, 'warn');
    }
    return EMBEDDING_DIMS;
  }, [state.embeddingEnabled, generateEmbedding, addLog]);

  const start = useCallback(async () => {
    if (running) return;
    const esEp = esEndpoints[activeES];
    if (!esEp) { addLog('Configure an Elasticsearch endpoint first', 'error'); return; }

    const indexName = state.activePersonal || coreIndexName(state.coreName);

    // Auto-detect the embedding dimension from the model so the mapping always matches
    const dims = await probeDims();

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
    addLog(`Core ingestion started — target: ${indexName}`, 'ok');
    if (state.embeddingEnabled) addLog(`Embeddings ON — model: ${state.embeddingModel}`, 'ok');

    await ingestCore(esEp.url, indexName, state.queries, sourceIndices);

    if (runningRef.current) addLog('All queries processed. Core complete.', 'ok');
    runningRef.current = false;
    setRunning(false);
  }, [running, esEndpoints, activeES, state, ensureIndex, getSourceIndices, probeDims, ingestCore, addLog]);

  // Every core preset in turn — each preset builds its own knowledge core from its tags,
  // and the panel follows whichever core is being built
  const runAllCores = useCallback(async () => {
    if (running) return;
    const esUrl = esEndpoints[activeES]?.url;
    if (!esUrl) { addLog('Configure an Elasticsearch endpoint first', 'error'); return; }
    const presets = loadPresets();
    if (presets.length === 0) { addLog('No core presets defined', 'error'); return; }

    const dims = await probeDims();

    let sourceIndices = [];
    try {
      sourceIndices = await getSourceIndices(esUrl);
      if (sourceIndices.length === 0) { addLog('No source indices found — nothing to ingest', 'error'); return; }
      addLog(`Source indices discovered: ${sourceIndices.length} (excl. knowledge_core_*)`, 'ok');
    } catch (e) { addLog(`Failed to discover indices: ${e.message}`, 'error'); return; }

    runningRef.current = true;
    setRunning(true);
    addLog(`ALL PRESETS INGEST — ${presets.length} cores queued`, 'ok');

    let done = 0;
    for (let i = 0; i < presets.length && runningRef.current; i++) {
      const preset = presets[i];
      const tags = [...new Set((preset.queries || preset.tags || []).filter(Boolean))];
      const indexName = coreIndexName(preset.name);
      // The panel follows the core being built, so the queue shows live progress
      setState(prev => ({ ...prev, coreName: preset.name, activePersonal: '', queries: tags }));
      addLog(`━━ [${i + 1}/${presets.length}] ${preset.label} → ${indexName} · ${tags.length} tags`, 'info');
      const ok = await ensureIndex(esUrl, indexName, state.embeddingEnabled, dims);
      if (!ok) { addLog(`  ${indexName} skipped — index unavailable`, 'error'); continue; }
      await ingestCore(esUrl, indexName, tags, sourceIndices);
      if (runningRef.current) { done++; addLog(`━━ ${indexName} COMPLETE`, 'ok'); }
    }

    runningRef.current = false;
    setRunning(false);
    addLog(`ALL PRESETS FINISHED — ${done}/${presets.length} cores ingested`, done === presets.length ? 'ok' : 'warn');
  }, [running, esEndpoints, activeES, state.embeddingEnabled, ensureIndex, getSourceIndices, probeDims, ingestCore, addLog]);

  const addQuery = () => {
    if (!newQuery.trim()) return;
    const q = newQuery.trim();
    if (state.queries.includes(q)) { setNewQuery(''); return; }
    setState(prev => ({ ...prev, queries: [...prev.queries, q] }));
    setNewQuery('');
  };
  const removeQuery = (q) => setState(prev => ({ ...prev, queries: prev.queries.filter(x => x !== q) }));

  // Selecting a preset loads its tags (queries) straight into the ingest queue, and
  // still opens the refiner so a message can turn it into a refined personal core
  const applyPreset = useCallback((preset) => {
    const presetTags = (preset.queries || preset.tags || []).filter(Boolean);
    setState(prev => ({
      ...prev,
      coreName: preset.name,
      activePersonal: '',
      // A preset click starts a fresh queue — only this preset's tags stay
      queries: [...new Set(presetTags)],
    }));
    setRefining(preset);
    addLog(`Preset "${preset.label}" — queue reset to ${presetTags.length} tags`, 'ok');
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
    if (!esEp?.url) { setIndexStatus('unknown'); setVectorField(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${esEp.url}/${indexName}`);
        const status = res.status === 200 ? 'exists' : res.status === 404 ? 'missing' : 'error';
        setIndexStatus(status);
        setVectorField(status === 'exists' ? await readEmbeddingField(esEp.url, indexName) : null);
      } catch { setIndexStatus('error'); setVectorField(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [esEp?.url, indexName, mappingTick]);

  // Adds the vector field to the core on screen — the usual fix when a local cluster
  // created the index without it, so semantic search has nowhere to store vectors
  const repairCurrentCore = useCallback(async () => {
    if (!esEp?.url) return;
    setPatching(true);
    try {
      let dims = EMBEDDING_DIMS;
      try {
        const probe = await generateEmbedding('dimension probe');
        if (probe?.length) dims = probe.length;
      } catch (e) {
        addLog(`Dimension probe failed (${e.message}) — using ${EMBEDDING_DIMS}`, 'warn');
      }
      const r = await ensureEmbeddingField(esEp.url, indexName, dims);
      if (r.existing) { setMappingError(''); addLog(`"${indexName}" already stores vectors (${r.existing.dims || dims}d)`, 'dim'); }
      else if (r.ok) { setMappingError(''); addLog(`Vector field added to "${indexName}" (${dims}d, ${r.mode}) — re-index to fill it`, 'ok'); }
      else { setMappingError(r.error); addLog(`Could not add the vector field: ${r.error}`, 'error'); }
      setVectorField(await readEmbeddingField(esEp.url, indexName));
      setMappingTick(t => t + 1);
    } finally {
      setPatching(false);
    }
  }, [esEp?.url, indexName, generateEmbedding, addLog]);

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
                {indexStatus === 'exists' && (vectorField ? (
                  <span style={{ marginLeft: 8, color: '#7eb8ff' }}>◈ VEC {vectorField.dims || '?'}d</span>
                ) : (
                  <button onClick={repairCurrentCore} disabled={patching}
                    title="Add the embedding field to this core's mapping"
                    style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, cursor: patching ? 'not-allowed' : 'pointer', color: '#ffaa00', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.58rem', letterSpacing: '1px', textDecoration: 'underline' }}>
                    ◈ NO VEC FIELD — ADD IT
                  </button>
                ))}
              </div>
              {mappingError && !vectorField && (
                <div title={mappingError} style={{ fontSize: '0.55rem', color: '#ff6666', letterSpacing: '1px', marginTop: 4, lineHeight: 1.5, wordBreak: 'break-word' }}>
                  ✗ MAPPING REFUSED — {mappingError}
                </div>
              )}
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
                  <div style={{ fontSize: '0.56rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px', marginTop: 2 }}>Expands queries into synonyms, concepts &amp; sub-fields (radio, amateur...)</div>
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
                    <select value={state.embeddingModel}
                      onChange={e => setState(prev => ({ ...prev, embeddingModel: e.target.value }))}
                      style={{ width: '100%', padding: '4px 8px', borderRadius: 3, fontSize: '0.7rem' }}>
                      {/* The saved model stays selectable even when the host does not list it */}
                      {state.embeddingModel && !embedModels.includes(state.embeddingModel) && (
                        <option value={state.embeddingModel}>{state.embeddingModel}</option>
                      )}
                      {embedModels.map(m => <option key={m} value={m}>{m}</option>)}
                      {embedModels.length === 0 && !state.embeddingModel && (
                        <option value="">No embedding models at this URL</option>
                      )}
                    </select>
                  </div>
                  <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px' }}>
                    Stores dense_vector {EMBEDDING_DIMS}d (int8_hnsw, cosine) — enables semantic kNN search
                  </div>
                  <label
                    title="Add the embedding field to a core's mapping automatically when the core is created"
                    style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: '0.58rem', color: state.autoApproveMapping !== false ? 'rgba(0,255,204,0.55)' : 'rgba(0,255,204,0.3)', letterSpacing: '1.2px', fontFamily: 'Rajdhani, sans-serif' }}>
                    <input type="checkbox"
                      checked={state.autoApproveMapping !== false}
                      onChange={e => setState(prev => ({ ...prev, autoApproveMapping: e.target.checked }))}
                      style={{ width: 12, height: 12, accentColor: '#00ffcc', cursor: 'pointer', margin: 0 }}
                    />
                    CONFIRM MAPPING ON CORE CREATION
                  </label>
                  <button onClick={patchAllCores} disabled={patching}
                    title="Add the embedding field to every existing knowledge core that is missing it"
                    style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '1.2px', padding: '4px 8px', borderRadius: 3, cursor: patching ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid rgba(126,184,255,0.45)', color: '#7eb8ff', background: 'rgba(126,184,255,0.07)', opacity: patching ? 0.6 : 1 }}>
                    {patching ? <RefreshCw size={9} className="animate-spin" /> : null} PATCH ALL CORES
                  </button>
                </div>
              )}
            </div>

            {/* Result limit */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>RESULT LIMIT</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--neon-primary)', fontFamily: 'Rajdhani, sans-serif' }}>{(state.resultLimit ?? 10000).toLocaleString()}</span>
              </div>
              <input type="range" min={100} max={10000} step={100} value={state.resultLimit ?? 10000}
                onChange={e => setState(prev => ({ ...prev, resultLimit: parseInt(e.target.value) }))}
                style={{ width: '100%' }}
              />
              <div className="flex justify-between" style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.2)', letterSpacing: '1px', marginTop: 2 }}>
                <span>100</span><span>10,000 max</span>
              </div>
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

            {/* Every preset, one core after another */}
            <button onClick={runAllCores}
              disabled={running || !esEndpoints[activeES]}
              title="Ingest every core preset in sequence — pick a preset first if you only want one"
              className="neon-btn px-4 py-2 rounded text-xs flex items-center justify-center gap-2 font-bold tracking-widest">
              <Layers size={12} /> INGEST ALL PRESETS
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

            {/* Two vector searches over every core — one on the embedded keys, one on the text */}
            <CoreQuickSearch
              esUrl={esEp?.url}
              embeddingUrl={state.embeddingUrl}
              embeddingModel={state.embeddingModel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
