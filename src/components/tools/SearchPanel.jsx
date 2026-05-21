import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, RefreshCw, ExternalLink, Zap, AlignLeft, GitMerge } from 'lucide-react';
import { INDEX_PREFIX } from './CorePanel';

const MODES = [
  { id: 'text',   label: '◈ FULL-TEXT',   icon: AlignLeft,  desc: 'Boolean keyword search' },
  { id: 'knn',    label: '⬡ SEMANTIC',    icon: Zap,        desc: 'Vector similarity (kNN)' },
  { id: 'hybrid', label: '⟁ HYBRID',      icon: GitMerge,   desc: 'kNN + text fused & re-ranked' },
];

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

export default function SearchPanel({ esEndpoints, activeES, embeddingUrl, embeddingModel, embeddingEnabled }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchMode, setSearchMode] = useState('text');
  const [activeIndex, setActiveIndex] = useState('');
  const [indices, setIndices] = useState([]);
  const [k, setK] = useState(10);
  const [indicesLoaded, setIndicesLoaded] = useState(false);
  const [liveSearch, setLiveSearch] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const [searchTime, setSearchTime] = useState(null);
  const debounceRef = useRef(null);

  const esEp = esEndpoints[activeES];

  const loadIndices = useCallback(async () => {
    if (!esEp) return;
    const res = await fetch(`${esEp.url}/_cat/indices/${INDEX_PREFIX}*?format=json`);
    if (!res.ok) return;
    const json = await res.json();
    const names = (json || []).map(i => i.index).sort();
    setIndices(names);
    if (names.length > 0 && !activeIndex) setActiveIndex(names[0]);
    setIndicesLoaded(true);
  }, [esEp, activeIndex]);

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

  const runSearch = useCallback(async (q = query, mode = searchMode) => {
    if (!q.trim() || !esEp || !activeIndex) return;
    setLoading(true);
    setError('');
    setResults([]);
    setTotalHits(0);
    setSearchTime(null);
    const t0 = Date.now();

    try {
      let hits = [];
      let total = 0;

      if (mode === 'text') {
        const body = {
          query: { multi_match: { query: q.trim(), fields: ['title^3', 'snippet^1.5', 'query'], type: 'best_fields', fuzziness: 'AUTO' } },
          _source: ['query', 'title', 'url', 'snippet', 'scraped_at'],
          size: k,
        };
        const res = await fetch(`${esEp.url}/${activeIndex}/_search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
        const json = await res.json();
        hits = (json.hits?.hits || []).map(h => ({ ...h._source, _score: h._score, _mode: 'text' }));
        total = json.hits?.total?.value || hits.length;

      } else if (mode === 'knn') {
        if (!embeddingEnabled) throw new Error('Enable embeddings in INGEST tab first, then re-index');
        const vector = await generateEmbedding(q.trim());
        const body = {
          knn: { field: 'embedding', query_vector: vector, k, num_candidates: k * 15 },
          _source: ['query', 'title', 'url', 'snippet', 'scraped_at'],
          size: k,
        };
        const res = await fetch(`${esEp.url}/${activeIndex}/_search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`kNN HTTP ${res.status}`);
        const json = await res.json();
        hits = (json.hits?.hits || []).map(h => ({ ...h._source, _score: h._score, _mode: 'knn' }));
        total = json.hits?.total?.value || hits.length;

      } else if (mode === 'hybrid') {
        if (!embeddingEnabled) throw new Error('Enable embeddings in INGEST tab first for hybrid search');
        const vector = await generateEmbedding(q.trim());

        const [knnRes, textRes] = await Promise.all([
          fetch(`${esEp.url}/${activeIndex}/_search`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ knn: { field: 'embedding', query_vector: vector, k, num_candidates: k * 15 }, _source: ['query', 'title', 'url', 'snippet', 'scraped_at'], size: k }),
          }),
          fetch(`${esEp.url}/${activeIndex}/_search`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: { multi_match: { query: q.trim(), fields: ['title^3', 'snippet^1.5', 'query'], type: 'best_fields', fuzziness: 'AUTO' } }, _source: ['query', 'title', 'url', 'snippet', 'scraped_at'], size: k }),
          }),
        ]);

        const [knnJson, textJson] = await Promise.all([knnRes.json(), textRes.json()]);
        const knnHits = knnJson.hits?.hits || [];
        const textHits = textJson.hits?.hits || [];

        // Reciprocal Rank Fusion
        const scoreMap = {};
        const RRF_K = 60;
        knnHits.forEach((h, rank) => { scoreMap[h._id || h._source.url] = { doc: h._source, score: 1 / (RRF_K + rank + 1), url: h._source.url }; });
        textHits.forEach((h, rank) => {
          const key = h._id || h._source.url;
          if (scoreMap[key]) scoreMap[key].score += 1 / (RRF_K + rank + 1);
          else scoreMap[key] = { doc: h._source, score: 1 / (RRF_K + rank + 1) };
        });

        hits = Object.values(scoreMap)
          .sort((a, b) => b.score - a.score)
          .slice(0, k)
          .map(({ doc, score }) => ({ ...doc, _score: score, _mode: 'hybrid' }));
        total = hits.length;
      }

      const maxScore = hits.reduce((m, h) => Math.max(m, h._score || 0), 0);
      setResults(hits.map(h => ({ ...h, _maxScore: maxScore })));
      setTotalHits(total);
      setSearchTime(Date.now() - t0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, esEp, activeIndex, searchMode, embeddingEnabled, generateEmbedding, k]);

  // Live debounced search
  useEffect(() => {
    if (!liveSearch || !query.trim()) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, searchMode), 600);
    return () => clearTimeout(debounceRef.current);
  }, [query, liveSearch, searchMode, runSearch]);

  const needsEmbedding = searchMode === 'knn' || searchMode === 'hybrid';

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

        {/* Index picker */}
        {!indicesLoaded
          ? <button className="neon-btn px-3 py-1 rounded text-xs" onClick={loadIndices}>LOAD INDICES</button>
          : indices.map(idx => (
            <button key={idx} onClick={() => setActiveIndex(idx)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${activeIndex === idx ? '#7eb8ff' : 'rgba(0,255,204,0.2)'}`, background: activeIndex === idx ? 'rgba(126,184,255,0.08)' : 'transparent', color: activeIndex === idx ? '#7eb8ff' : 'rgba(0,255,204,0.45)' }}>
              {idx.replace(INDEX_PREFIX, '')}
            </button>
          ))
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
        <button className="neon-btn px-5 py-2 rounded text-sm flex items-center gap-2" onClick={() => runSearch()} disabled={loading || !activeIndex}>
          <Search size={13} /> SEARCH
        </button>
      </div>

      {/* Mode description */}
      <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
        {searchMode === 'text'   && '◈ FULL-TEXT — BM25 RANKING WITH FUZZY MATCHING ACROSS TITLE + SNIPPET + QUERY FIELDS'}
        {searchMode === 'knn'    && '⬡ SEMANTIC — APPROXIMATE NEAREST NEIGHBOUR SEARCH AGAINST 768-DIM DENSE VECTORS (cosine)'}
        {searchMode === 'hybrid' && '⟁ HYBRID — kNN + FULL-TEXT FUSED VIA RECIPROCAL RANK FUSION (RRF-60) FOR BEST RECALL + PRECISION'}
      </div>

      {error && <div style={{ color: '#ff4444', fontSize: '0.75rem', padding: '7px 11px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

      {/* Results header */}
      {results.length > 0 && (
        <div className="flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,255,204,0.08)', paddingBottom: 6 }}>
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
            {results.length}{totalHits > results.length ? ` / ${totalHits.toLocaleString()}` : ''} RESULTS
          </span>
          {searchTime != null && (
            <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1.5px' }}>{searchTime}ms</span>
          )}
          <span style={{ fontSize: '0.58rem', letterSpacing: '2px', color: searchMode === 'knn' ? '#7eb8ff' : searchMode === 'hybrid' ? '#bb88ff' : 'var(--neon-primary)', marginLeft: 'auto' }}>
            {searchMode === 'knn' ? 'COSINE SIM' : searchMode === 'hybrid' ? 'RRF SCORE' : 'BM25 RELEVANCE'}
          </span>
        </div>
      )}

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
          NO RESULTS — TRY A DIFFERENT QUERY OR INDEX
        </div>
      )}

      {!query && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.12)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.72rem', lineHeight: 2 }}>
          {searchMode === 'knn'    && '⬡ ENTER A NATURAL LANGUAGE QUERY\nTO RETRIEVE SEMANTICALLY SIMILAR DOCUMENTS VIA kNN'}
          {searchMode === 'text'   && '◈ ENTER KEYWORDS TO PERFORM\nBM25 FULL-TEXT SEARCH ACROSS THE KNOWLEDGE CORE'}
          {searchMode === 'hybrid' && '⟁ ENTER ANY QUERY — HYBRID MODE COMBINES\nSEMANTIC + KEYWORD RETRIEVAL FOR MAXIMUM RECALL'}
        </div>
      )}
    </div>
  );
}