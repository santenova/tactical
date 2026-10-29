import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, RefreshCw, ExternalLink, Zap, AlignLeft, GitMerge, Sparkles } from 'lucide-react';
import { INDEX_PREFIX } from './CorePanel';
import RagAnswer from './RagAnswer';

const MODES = [
  { id: 'text',   label: '◈ FULL-TEXT',   icon: AlignLeft,  desc: 'Boolean keyword search' },
  { id: 'knn',    label: '⬡ SEMANTIC',    icon: Zap,        desc: 'Vector similarity (kNN)' },
  { id: 'hybrid', label: '⟁ HYBRID',      icon: GitMerge,   desc: 'Native kNN + text, RRF fallback' },
];

const SOURCE_FIELDS = ['query', 'title', 'url', 'snippet', 'scraped_at'];

const textQuery = (q) => ({ multi_match: { query: q, fields: ['title^3', 'snippet^1.5', 'query'], type: 'best_fields', fuzziness: 'AUTO' } });
const coreLabel = (idx) => (idx || '').replace(INDEX_PREFIX, '');

function ScoreBar({ score, maxScore, mode }) {
  const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
  const color = mode === 'knn' ? '#7eb8ff' : mode === 'hybrid' ? '#bb88ff' : 'var(--neon-primary)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '0.58rem', color, letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif', flexShrink: 0 }}>
        {mode === 'knn' ? score.toFixed(4) : score.toFixed(2)}
      </span>
    </div>
  );
}

function highlight(text, query) {
  if (!text || !query) return text;
  const words = query.trim().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return text;
  const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((p, i) =>
    regex.test(p)
      ? <mark key={i} style={{ background: 'rgba(0,255,204,0.2)', color: 'var(--neon-primary)', borderRadius: 2, padding: '0 1px' }}>{p}</mark>
      : p
  );
}

export default function SearchPanel({ esEndpoints, activeES, embeddingUrl, embeddingModel, summaryModel, embeddingEnabled }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchMode, setSearchMode] = useState('text');
  // Empty selection = federated search across every knowledge core
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [indices, setIndices] = useState([]);
  const [k, setK] = useState(10);
  const [indicesLoaded, setIndicesLoaded] = useState(false);
  const [liveSearch, setLiveSearch] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const [searchedCores, setSearchedCores] = useState(0);
  const [searchTime, setSearchTime] = useState(null);
  const [ragAnswer, setRagAnswer] = useState('');
  const [ragSources, setRagSources] = useState([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState('');
  const debounceRef = useRef(null);

  const esEp = esEndpoints[activeES];

  const loadIndices = useCallback(async () => {
    if (!esEp) return;
    setIndicesLoaded(false);
    try {
      const res = await fetch(`${esEp.url}/_cat/indices/${INDEX_PREFIX}*?format=json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const names = (json || []).map(i => i.index).sort();
      setIndices(names);
      setSelectedIndices([]); // default: every core
      setIndicesLoaded(true);
      setError('');
    } catch (e) {
      setError(`Failed to list knowledge cores: ${e.message}`);
    }
  }, [esEp]);

  const generateEmbedding = useCallback(async (text) => {
    const res = await fetch(`${embeddingUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embeddingModel, prompt: text }),
    });
    if (!res.ok) throw new Error(`Embedding HTTP ${res.status}`);
    const json = await res.json();
    if (!json.embedding) throw new Error('Embedding returned null');
    return json.embedding;
  }, [embeddingUrl, embeddingModel]);

  const setSearchMeta = (hits, total) => {
    const maxScore = hits.reduce((m, h) => Math.max(m, h._score || 0), 0);
    setResults(hits.map(h => ({ ...h, _maxScore: maxScore })));
    setTotalHits(total);
  };

  const runSearch = useCallback(async (q = query, mode = searchMode) => {
    if (!q.trim() || !esEp) return;
    if (!indicesLoaded) { setError('Load knowledge cores first'); return; }
    const target = (selectedIndices.length ? selectedIndices : indices).join(',');
    if (!target) { setError('No knowledge cores available — build one in the INGEST tab'); return; }

    setLoading(true);
    setError('');
    setResults([]);
    setTotalHits(0);
    setSearchedCores(target.split(',').length);
    setSearchTime(null);
    setRagAnswer('');
    setRagSources([]);
    setRagError('');
    const t0 = Date.now();

    try {
      let hits = [];
      let total = 0;

      if (mode === 'text') {
        const body = { query: textQuery(q.trim()), _source: SOURCE_FIELDS, size: k };
        const res = await fetch(`${esEp.url}/${target}/_search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
        const json = await res.json();
        hits = (json.hits?.hits || []).map(h => ({ ...h._source, _index: h._index, _score: h._score, _mode: 'text' }));
        total = json.hits?.total?.value || hits.length;

      } else if (mode === 'knn') {
        if (!embeddingEnabled) throw new Error('Enable embeddings in INGEST tab first, then re-index');
        const vector = await generateEmbedding(q.trim());
        const body = {
          knn: { field: 'embedding', query_vector: vector, k, num_candidates: k * 15 },
          _source: SOURCE_FIELDS,
          size: k,
        };
        const res = await fetch(`${esEp.url}/${target}/_search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`kNN HTTP ${res.status}`);
        const json = await res.json();
        hits = (json.hits?.hits || []).map(h => ({ ...h._source, _index: h._index, _score: h._score, _mode: 'knn' }));
        total = json.hits?.total?.value || hits.length;

      } else if (mode === 'hybrid') {
        if (!embeddingEnabled) throw new Error('Enable embeddings in INGEST tab first for hybrid search');
        const vector = await generateEmbedding(q.trim());

        // Native ES hybrid: kNN and BM25 evaluated in one request, scores combined server-side
        const nativeBody = {
          knn: { field: 'embedding', query_vector: vector, k, num_candidates: k * 15 },
          query: textQuery(q.trim()),
          _source: SOURCE_FIELDS,
          size: k,
        };
        const nativeRes = await fetch(`${esEp.url}/${target}/_search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nativeBody) });

        if (nativeRes.ok) {
          const json = await nativeRes.json();
          hits = (json.hits?.hits || []).map(h => ({ ...h._source, _index: h._index, _score: h._score, _mode: 'hybrid' }));
          total = json.hits?.total?.value || hits.length;
        } else {
          // Fallback for clusters without native hybrid support — client-side RRF
          const [knnRes, textRes] = await Promise.all([
            fetch(`${esEp.url}/${target}/_search`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ knn: { field: 'embedding', query_vector: vector, k, num_candidates: k * 15 }, _source: SOURCE_FIELDS, size: k }),
            }),
            fetch(`${esEp.url}/${target}/_search`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: textQuery(q.trim()), _source: SOURCE_FIELDS, size: k }),
            }),
          ]);
          if (!knnRes.ok && !textRes.ok) throw new Error(`Hybrid HTTP ${nativeRes.status}`);

          const [knnJson, textJson] = await Promise.all([knnRes.json(), textRes.json()]);
          const knnHits = knnJson.hits?.hits || [];
          const textHits = textJson.hits?.hits || [];

          const scoreMap = {};
          const RRF_K = 60;
          knnHits.forEach((h, rank) => {
            const key = `${h._index}:${h._id || h._source.url}`;
            scoreMap[key] = { doc: h._source, index: h._index, score: 1 / (RRF_K + rank + 1) };
          });
          textHits.forEach((h, rank) => {
            const key = `${h._index}:${h._id || h._source.url}`;
            if (scoreMap[key]) scoreMap[key].score += 1 / (RRF_K + rank + 1);
            else scoreMap[key] = { doc: h._source, index: h._index, score: 1 / (RRF_K + rank + 1) };
          });

          hits = Object.values(scoreMap)
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map(({ doc, index, score }) => ({ ...doc, _index: index, _score: score, _mode: 'hybrid' }));
          total = hits.length;
        }
      }

      setSearchMeta(hits, total);
      setSearchTime(Date.now() - t0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, esEp, indices, selectedIndices, indicesLoaded, searchMode, embeddingEnabled, generateEmbedding, k]);

  const synthesize = useCallback(async () => {
    if (!results.length || !query.trim()) return;
    setRagLoading(true);
    setRagError('');
    setRagAnswer('');
    const sources = results.slice(0, 8).map((r, i) => ({ n: i + 1, title: r.title || 'Untitled', url: r.url, snippet: r.snippet || '' }));
    const context = sources.map(s => `[${s.n}] ${s.title}\n${s.snippet}`).join('\n\n');
    const prompt = `You are a research analyst. Answer the question using ONLY the numbered sources below.
Cite every claim inline with its source number, like [1] or [2][3].
If the sources do not contain the answer, reply exactly: "The indexed sources do not cover this."
Be concise (maximum 6 sentences).

QUESTION: ${query.trim()}

SOURCES:
${context}`;
    try {
      const res = await fetch(`${embeddingUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: summaryModel || 'llama3:latest', messages: [{ role: 'user', content: prompt }], stream: false }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const json = await res.json();
      setRagAnswer(json.choices?.[0]?.message?.content || '');
      setRagSources(sources);
    } catch (e) {
      setRagError(e.message);
    } finally {
      setRagLoading(false);
    }
  }, [results, query, embeddingUrl, summaryModel]);

  // Knowledge cores load as soon as the panel opens — LOAD CORES is only a re-scan
  useEffect(() => { loadIndices(); }, [esEp?.url]);

  // Live debounced search
  useEffect(() => {
    if (!liveSearch || !query.trim()) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, searchMode), 600);
    return () => clearTimeout(debounceRef.current);
  }, [query, liveSearch, searchMode, runSearch]);

  const needsEmbedding = searchMode === 'knn' || searchMode === 'hybrid';
  const activeCores = selectedIndices.length || indices.length;

  return (
    <div className="flex flex-col gap-3">

      {/* Mode selector */}
      <div className="flex flex-wrap items-center gap-2">
        {MODES.map(m => (
          <button key={m.id} onClick={() => setSearchMode(m.id)}
            title={m.desc}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px', padding: '4px 11px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${searchMode === m.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: searchMode === m.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: searchMode === m.id ? 'rgba(0,255,204,0.07)' : 'transparent', transition: 'all 0.2s' }}>
            {m.label}
          </button>
        ))}

        <div style={{ width: 1, height: 14, background: 'rgba(0,255,204,0.12)', flexShrink: 0 }} />

        {/* Federated core picker */}
        {!indicesLoaded
          ? <button className="neon-btn px-3 py-1 rounded text-xs" onClick={loadIndices}>LOAD CORES</button>
          : indices.length === 0
            ? <span style={{ fontSize: '0.65rem', color: 'rgba(255,170,0,0.7)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>NO CORES FOUND</span>
            : (
              <>
                <button onClick={() => setSelectedIndices([])}
                  title="Search every knowledge core"
                  style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1.5px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${selectedIndices.length === 0 ? '#7eb8ff' : 'rgba(0,255,204,0.2)'}`, background: selectedIndices.length === 0 ? 'rgba(126,184,255,0.1)' : 'transparent', color: selectedIndices.length === 0 ? '#7eb8ff' : 'rgba(0,255,204,0.45)' }}>
                  ⬡ ALL
                </button>
                {indices.map(idx => {
                  const on = selectedIndices.includes(idx);
                  return (
                    <button key={idx}
                      onClick={() => setSelectedIndices(prev => prev.includes(idx) ? prev.filter(x => x !== idx) : [...prev, idx])}
                      title={on ? 'Remove from search scope' : 'Add to search scope'}
                      style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${on ? '#7eb8ff' : 'rgba(0,255,204,0.2)'}`, background: on ? 'rgba(126,184,255,0.08)' : 'transparent', color: on ? '#7eb8ff' : 'rgba(0,255,204,0.45)' }}>
                      {coreLabel(idx)}
                    </button>
                  );
                })}
              </>
            )
        }

        <div className="ml-auto flex items-center gap-3">
          {/* Live toggle */}
          <button onClick={() => setLiveSearch(v => !v)}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.58rem', letterSpacing: '1.5px', padding: '3px 8px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${liveSearch ? '#00cc66' : 'rgba(0,255,204,0.2)'}`, color: liveSearch ? '#00cc66' : 'rgba(0,255,204,0.4)', background: liveSearch ? 'rgba(0,204,102,0.07)' : 'transparent' }}>
            {liveSearch ? '● LIVE' : '○ LIVE'}
          </button>
          {/* K selector */}
          <div className="flex items-center gap-1">
            <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1.5px' }}>TOP-K</span>
            <select value={k} onChange={e => setK(Number(e.target.value))} style={{ padding: '3px 6px', borderRadius: 3, fontSize: '0.72rem', width: 60 }}>
              {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Warning */}
      {needsEmbedding && !embeddingEnabled && (
        <div style={{ fontSize: '0.7rem', color: '#ffaa00', padding: '7px 12px', background: 'rgba(255,170,0,0.07)', border: '1px solid rgba(255,170,0,0.2)', borderRadius: 3, letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>
          ⚠ {searchMode === 'hybrid' ? 'Hybrid' : 'Semantic kNN'} requires embeddings enabled in INGEST + vectors already indexed
        </div>
      )}

      {/* Search bar */}
      <div className="flex gap-2">
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder={
              searchMode === 'knn'    ? 'Describe what you\'re looking for (natural language)...' :
              searchMode === 'hybrid' ? 'Natural language or keywords — hybrid retrieval...' :
                                       'Enter keywords to search...'
            }
            style={{ width: '100%', padding: '9px 12px', borderRadius: 3, fontSize: '0.82rem' }}
          />
          {loading && <RefreshCw size={12} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--neon-primary)' }} />}
        </div>
        <button className="neon-btn px-5 py-2 rounded text-sm flex items-center gap-2" onClick={() => runSearch()} disabled={loading || !indicesLoaded || indices.length === 0}>
          <Search size={13} /> SEARCH
        </button>
      </div>

      {/* Mode description */}
      <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
        {searchMode === 'text'   && `◈ FULL-TEXT — BM25 RANKING WITH FUZZY MATCHING ACROSS ${activeCores} CORE${activeCores === 1 ? '' : 'S'}`}
        {searchMode === 'knn'    && `⬡ SEMANTIC — APPROXIMATE NEAREST NEIGHBOUR SEARCH AGAINST DENSE VECTORS (cosine) ACROSS ${activeCores} CORE${activeCores === 1 ? '' : 'S'}`}
        {searchMode === 'hybrid' && '⟁ HYBRID — NATIVE kNN + BM25 IN A SINGLE QUERY (auto-fallbacks to RRF-60)'}
      </div>

      {error && <div style={{ color: '#ff4444', fontSize: '0.75rem', padding: '7px 11px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

      {/* Results header */}
      {results.length > 0 && (
        <div className="flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,255,204,0.08)', paddingBottom: 6 }}>
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
            {results.length}{totalHits > results.length ? ` / ${totalHits.toLocaleString()}` : ''} RESULTS
          </span>
          {searchedCores > 1 && (
            <span style={{ fontSize: '0.58rem', color: 'rgba(126,184,255,0.5)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
              ⬡ {searchedCores} CORES
            </span>
          )}
          {searchTime != null && (
            <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1.5px' }}>{searchTime}ms</span>
          )}
          <span style={{ fontSize: '0.58rem', letterSpacing: '2px', color: searchMode === 'knn' ? '#7eb8ff' : searchMode === 'hybrid' ? '#bb88ff' : 'var(--neon-primary)', marginLeft: 'auto' }}>
            {searchMode === 'knn' ? 'COSINE SIM' : searchMode === 'hybrid' ? 'FUSED SCORE' : 'BM25 RELEVANCE'}
          </span>
          <button onClick={synthesize} disabled={ragLoading}
            title="Synthesize a cited answer from these results"
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '1.5px', padding: '3px 10px', borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, border: '1px solid rgba(187,136,255,0.5)', color: '#bb88ff', background: 'rgba(187,136,255,0.07)' }}>
            {ragLoading ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />} AI ANSWER
          </button>
        </div>
      )}

      <RagAnswer
        answer={ragAnswer}
        sources={ragSources}
        loading={ragLoading}
        error={ragError}
        onClose={() => { setRagAnswer(''); setRagSources([]); setRagError(''); }}
      />

      {/* Results list */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {results.map((r, i) => (
            <div key={i} style={{ background: 'rgba(0,255,204,0.02)', border: '1px solid rgba(0,255,204,0.07)', borderRadius: 4, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5, transition: 'border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,255,204,0.18)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(0,255,204,0.07)'}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.2)', fontFamily: 'Rajdhani, sans-serif', flexShrink: 0, paddingTop: 2 }}>#{i + 1}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--neon-primary)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, wordBreak: 'break-word' }}>
                    {highlight(r.title, query)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r._score != null && <ScoreBar score={r._score} maxScore={r._maxScore} mode={r._mode} />}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(0,255,204,0.35)' }} title={r.url}>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>

              {r.snippet && (
                <div style={{ fontSize: '0.7rem', color: 'rgba(0,255,204,0.5)', lineHeight: 1.6, paddingLeft: 18 }}>
                  {highlight(r.snippet, query)}
                </div>
              )}

              <div className="flex flex-wrap gap-3" style={{ paddingLeft: 18 }}>
                {r._index && (
                  <span style={{ fontSize: '0.58rem', color: 'rgba(126,184,255,0.45)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>
                    ⬡ {coreLabel(r._index)}
                  </span>
                )}
                {r.query && (
                  <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>
                    ◈ {r.query}
                  </span>
                )}
                {r.scraped_at && (
                  <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.2)' }}>{r.scraped_at.slice(0, 10)}</span>
                )}
                {r.url && (
                  <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{r.url}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && query && !error && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(0,255,204,0.2)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.75rem' }}>
          NO RESULTS — TRY A DIFFERENT QUERY OR CORE
        </div>
      )}

      {!query && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.12)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.72rem', lineHeight: 2 }}>
          {searchMode === 'knn'    && '⬡ ENTER A NATURAL LANGUAGE QUERY\nTO RETRIEVE SEMANTICALLY SIMILAR DOCUMENTS VIA kNN'}
          {searchMode === 'text'   && '◈ ENTER KEYWORDS TO PERFORM\nBM25 FULL-TEXT SEARCH ACROSS THE KNOWLEDGE CORES'}
          {searchMode === 'hybrid' && '⟁ ENTER ANY QUERY — HYBRID MODE COMBINES\nSEMANTIC + KEYWORD RETRIEVAL FOR MAXIMUM RECALL'}
        </div>
      )}
    </div>
  );
}