import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Zap, BookOpen } from 'lucide-react';
import { INDEX_PREFIX } from './CorePanel';

const SUMMARIES_INDEX = 'knowledge_core_summaries';

export default function SummarizePanel({ esEndpoints, activeES, ollamaEndpoint, ollamaModel, onModelChange }) {
  const [indices, setIndices] = useState([]);
  const [activeIndex, setActiveIndex] = useState('');
  const [queries, setQueries] = useState([]);
  const [selectedQuery, setSelectedQuery] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [log, setLog] = useState('');
  const [summaries, setSummaries] = useState([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [error, setError] = useState('');

  const esEp = esEndpoints[activeES];

  const loadIndices = useCallback(async () => {
    if (!esEp) return;
    const res = await fetch(`${esEp.url}/_cat/indices/${INDEX_PREFIX}*?format=json`);
    if (!res.ok) return;
    const json = await res.json();
    const names = (json || []).map(i => i.index).filter(n => n !== SUMMARIES_INDEX).sort();
    setIndices(names);
    if (names.length > 0 && !activeIndex) setActiveIndex(names[0]);
  }, [esEp, activeIndex]);

  const loadQueries = useCallback(async () => {
    if (!esEp || !activeIndex) return;
    const res = await fetch(`${esEp.url}/${activeIndex}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size: 0,
        aggs: { unique_queries: { terms: { field: 'query', size: 50 } } }
      }),
    });
    if (!res.ok) return;
    const json = await res.json();
    const qs = (json.aggregations?.unique_queries?.buckets || []).map(b => b.key);
    setQueries(qs);
    if (qs.length > 0 && !selectedQuery) setSelectedQuery(qs[0]);
  }, [esEp, activeIndex, selectedQuery]);

  const loadSummaries = useCallback(async () => {
    if (!esEp) return;
    setLoadingSummaries(true);
    const res = await fetch(`${esEp.url}/${SUMMARIES_INDEX}/_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 50, sort: [{ created_at: { order: 'desc' } }] }),
    });
    if (res.ok) {
      const json = await res.json();
      setSummaries((json.hits?.hits || []).map(h => h._source));
    }
    setLoadingSummaries(false);
  }, [esEp]);

  useEffect(() => { loadIndices(); }, [esEp]);
  useEffect(() => { if (activeIndex) loadQueries(); }, [activeIndex]);
  useEffect(() => { loadSummaries(); }, [esEp]);

  const ensureSummariesIndex = useCallback(async () => {
    const res = await fetch(`${esEp.url}/${SUMMARIES_INDEX}`);
    if (res.status === 200) return true;
    const createRes = await fetch(`${esEp.url}/${SUMMARIES_INDEX}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mappings: {
          properties: {
            source_index: { type: 'keyword' },
            query: { type: 'keyword' },
            summary: { type: 'text' },
            doc_count: { type: 'integer' },
            created_at: { type: 'date' },
          }
        }
      }),
    });
    return createRes.ok;
  }, [esEp]);

  const runSummarize = useCallback(async () => {
    if (!selectedQuery || !esEp || !activeIndex) return;
    setSummarizing(true);
    setLog('');
    setError('');

    const appendLog = (msg) => setLog(prev => prev + msg + '\n');

    try {
      appendLog(`► Fetching docs for query: "${selectedQuery}"...`);
      const res = await fetch(`${esEp.url}/${activeIndex}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: 50,
          _source: ['title', 'snippet', 'url'],
          query: { term: { query: selectedQuery } },
        }),
      });
      if (!res.ok) throw new Error(`ES HTTP ${res.status}`);
      const json = await res.json();
      const docs = (json.hits?.hits || []).map(h => h._source);
      appendLog(`  → ${docs.length} documents retrieved`);
      if (docs.length === 0) throw new Error('No documents found for this query');

      const context = docs.map((d, i) => `[${i + 1}] ${d.title}\n${d.snippet || ''}`).join('\n\n');
      const promptText = `You are an intelligence analyst. Below are web search results for the query: "${selectedQuery}"\n\nAnalyze these results and produce a concise 3-5 sentence summary of the key findings, themes, and insights.\n\nRESULTS:\n${context}\n\nSUMMARY:`;

      appendLog(`► Calling LLM (${ollamaModel})...`);
      const llmRes = await fetch(`${ollamaEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [{ role: 'user', content: promptText }],
          stream: false,
        }),
      });
      if (!llmRes.ok) throw new Error(`LLM HTTP ${llmRes.status}`);
      const llmJson = await llmRes.json();
      const summary = llmJson.choices?.[0]?.message?.content?.trim() || '';
      if (!summary) throw new Error('LLM returned empty response');
      appendLog(`  → Summary generated (${summary.length} chars)`);

      appendLog(`► Storing in ${SUMMARIES_INDEX}...`);
      const ok = await ensureSummariesIndex();
      if (!ok) throw new Error(`Failed to create/access ${SUMMARIES_INDEX}`);

      const storeRes = await fetch(`${esEp.url}/${SUMMARIES_INDEX}/_doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_index: activeIndex,
          query: selectedQuery,
          summary,
          doc_count: docs.length,
          created_at: new Date().toISOString(),
        }),
      });
      if (!storeRes.ok) throw new Error(`Store HTTP ${storeRes.status}`);
      appendLog(`  ✓ Summary stored successfully`);
      appendLog(`\nDONE`);
      loadSummaries();
    } catch (e) {
      setError(e.message);
      appendLog(`  ✗ Error: ${e.message}`);
    } finally {
      setSummarizing(false);
    }
  }, [selectedQuery, esEp, activeIndex, ollamaEndpoint, ollamaModel, ensureSummariesIndex, loadSummaries]);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* LEFT — Config + controls */}
      <div className="flex flex-col gap-3 lg:w-80">
        <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 2 }}>SOURCE INDEX</div>
        {indices.length === 0 ? (
          <button className="neon-btn px-3 py-1 rounded text-xs" onClick={loadIndices}>LOAD INDICES</button>
        ) : (
          <div className="flex flex-wrap gap-1">
            {indices.map(idx => (
              <button key={idx} onClick={() => { setActiveIndex(idx); setSelectedQuery(''); setQueries([]); }}
                style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${activeIndex === idx ? '#7eb8ff' : 'rgba(0,255,204,0.2)'}`, background: activeIndex === idx ? 'rgba(126,184,255,0.08)' : 'transparent', color: activeIndex === idx ? '#7eb8ff' : 'rgba(0,255,204,0.45)' }}>
                {idx.replace(INDEX_PREFIX, '')}
              </button>
            ))}
          </div>
        )}

        {queries.length > 0 && (
          <>
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginTop: 4 }}>SELECT QUERY TO SUMMARIZE</div>
            <div className="flex flex-col gap-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {queries.map(q => (
                <button key={q} onClick={() => setSelectedQuery(q)}
                  style={{ textAlign: 'left', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.7rem', letterSpacing: '1px', padding: '5px 10px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${selectedQuery === q ? 'var(--neon-primary)' : 'rgba(0,255,204,0.1)'}`, color: selectedQuery === q ? 'var(--neon-primary)' : 'rgba(0,255,204,0.5)', background: selectedQuery === q ? 'rgba(0,255,204,0.07)' : 'transparent' }}>
                  {q}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '8px 12px' }}>
          <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', marginBottom: 3 }}>LLM ENDPOINT</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(0,255,204,0.6)', fontFamily: 'Rajdhani, sans-serif', marginBottom: 6 }}>{ollamaEndpoint}</div>
          <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', marginBottom: 4 }}>CHAT MODEL (for summarization)</div>
          <input type="text" value={ollamaModel} onChange={e => onModelChange?.(e.target.value)}
            placeholder="llama3:latest"
            style={{ width: '100%', padding: '4px 8px', borderRadius: 3, fontSize: '0.7rem' }}
          />
          <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.2)', letterSpacing: '1px', marginTop: 5 }}>Must be a chat-capable model (not embedding model)</div>
        </div>

        <button
          className="neon-btn px-4 py-3 rounded text-sm flex items-center justify-center gap-2 font-bold tracking-widest"
          onClick={runSummarize}
          disabled={summarizing || !selectedQuery}
        >
          {summarizing ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
          {summarizing ? 'SUMMARIZING...' : 'SUMMARIZE QUERY'}
        </button>

        {error && <div style={{ color: '#ff4444', fontSize: '0.7rem', padding: '6px 10px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

        {log && (
          <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.65rem', color: 'rgba(0,255,204,0.6)', whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto' }}>{log}</div>
        )}
      </div>

      {/* RIGHT — Stored summaries */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>
            STORED SUMMARIES ({summaries.length}) — index: {SUMMARIES_INDEX}
          </span>
          <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={loadSummaries} disabled={loadingSummaries}>
            <RefreshCw size={10} className={loadingSummaries ? 'animate-spin' : ''} /> REFRESH
          </button>
        </div>

        {summaries.length === 0 && !loadingSummaries && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.15)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.75rem' }}>
            NO SUMMARIES YET — SELECT A QUERY AND RUN SUMMARIZE
          </div>
        )}

        <div className="flex flex-col gap-3" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {summaries.map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,255,204,0.02)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '12px 16px' }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={11} style={{ color: 'var(--neon-primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--neon-primary)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600 }}>{s.query}</span>
                </div>
                <div className="flex gap-3 flex-shrink-0" style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>
                  <span>{s.doc_count} docs</span>
                  <span>{s.created_at?.slice(0, 10)}</span>
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(0,255,204,0.65)', lineHeight: 1.6, borderLeft: '2px solid rgba(0,255,204,0.12)', paddingLeft: 10 }}>
                {s.summary}
              </div>
              {s.source_index && (
                <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.2)', marginTop: 6, letterSpacing: '1px' }}>
                  source: {s.source_index}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}