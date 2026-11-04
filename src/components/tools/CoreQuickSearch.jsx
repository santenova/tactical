import React, { useState } from 'react';
import { Search, RefreshCw, KeyRound, FileText } from 'lucide-react';
import { embedText } from '@/lib/embeddings';

const INDEX_PREFIX = 'knowledge_core_';
const SOURCE_FIELDS = ['query', 'tags', 'title', 'url', 'snippet', 'scraped_at'];
const coreLabel = (idx) => (idx || '').replace(INDEX_PREFIX, '');

// Elasticsearch hides the real cause in the body of a failed request
async function esError(res, label) {
  let reason = '';
  try {
    const json = await res.json();
    reason = json?.error?.root_cause?.[0]?.reason || json?.error?.reason || '';
  } catch {}
  return new Error(`${label} HTTP ${res.status}${reason ? ` — ${reason}` : ''}`);
}

function VectorRow({ kind, label, hint, accent, icon: Icon, esUrl, embeddingUrl, embeddingModel }) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [ms, setMs] = useState(null);

  const run = async () => {
    const query = q.trim();
    if (!query) return;
    if (!esUrl) { setError('No Elasticsearch endpoint configured'); return; }
    setLoading(true);
    setError('');
    setNote('');
    setHits([]);
    setMs(null);
    const t0 = Date.now();
    try {
      const listRes = await fetch(`${esUrl}/_cat/indices/${INDEX_PREFIX}*?format=json&h=index`);
      if (!listRes.ok) throw new Error(`Core list HTTP ${listRes.status}`);
      const cores = (await listRes.json()).map(i => i.index);
      if (cores.length === 0) throw new Error('No knowledge cores yet — build one in INGEST first');

      const vector = await embedText(embeddingUrl, embeddingModel, query);

      const res = await fetch(`${esUrl}/${cores.join(',')}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knn: { field: 'embedding', query_vector: vector, k: 100, num_candidates: 1000 },
          _source: SOURCE_FIELDS,
          size: 100,
        }),
      });
      if (!res.ok) throw await esError(res, 'kNN');
      const json = await res.json();
      const all = (json.hits?.hits || []).map(h => ({ ...h._source, _index: h._index, _score: h._score }));

      // KEY LINE — keep only documents whose own keys carry the query, so the result is
      // the core that actually stores this key rather than prose that reads like it
      if (kind === 'key') {
        const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const keyed = all.filter(h => {
          const keys = [...(h.tags || []), h.query || ''].join(' ').toLowerCase();
          return words.some(w => keys.includes(w));
        });
        setHits(keyed.slice(0, 8));
        setNote(keyed.length === 0
          ? `NO CORE CARRIES THIS KEY — ${all.length} VECTOR MATCHES WERE FOUND, NONE TAGGED WITH "${query.toUpperCase()}"`
          : `${keyed.length} KEYED MATCH${keyed.length === 1 ? '' : 'ES'} OF ${all.length} VECTOR HITS`);
      } else {
        setHits(all.slice(0, 8));
        setNote(all.length === 0
          ? 'NO VECTORS IN THESE CORES — RE-INGEST IN THIS TAB WITH EMBEDDINGS ENABLED'
          : `${all.length} SEMANTIC MATCH${all.length === 1 ? '' : 'ES'} ACROSS ${cores.length} CORE${cores.length === 1 ? '' : 'S'}`);
      }
      setMs(Date.now() - t0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${accent}22`, background: `${accent}06`, borderRadius: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="flex items-center gap-2">
        <Icon size={10} style={{ color: accent, flexShrink: 0 }} />
        <span style={{ fontSize: '0.58rem', color: accent, letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>{label}</span>
        <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.22)', letterSpacing: '1px', marginLeft: 'auto' }}>{hint}</span>
      </div>

      <div className="flex gap-2">
        <input type="text" value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder={kind === 'key' ? 'Search the embedded keys of every core…' : 'Describe what you are looking for…'}
          style={{ flex: 1, padding: '5px 9px', borderRadius: 3, fontSize: '0.75rem' }}
        />
        <button onClick={run} disabled={loading || !q.trim()}
          className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1"
          style={{ borderColor: accent, color: accent }}>
          {loading ? <RefreshCw size={10} className="animate-spin" /> : <Search size={10} />} GO
        </button>
      </div>

      {error && <div style={{ fontSize: '0.65rem', color: '#ff6666', letterSpacing: '1px' }}>{error}</div>}
      {note && (
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '0.55rem', color: `${accent}99`, letterSpacing: '1.2px', fontFamily: 'Rajdhani, sans-serif' }}>{note}</span>
          {ms != null && <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.2)', marginLeft: 'auto' }}>{ms}ms</span>}
        </div>
      )}

      {hits.length > 0 && (
        <div style={{ maxHeight: 170, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {hits.map((h, i) => (
            <div key={i} style={{ padding: '5px 8px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,255,204,0.07)', borderRadius: 3 }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '0.7rem', color: 'var(--neon-primary)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.title || 'Untitled'}
                </span>
                <span style={{ fontSize: '0.55rem', color: `${accent}aa`, marginLeft: 'auto', flexShrink: 0, fontFamily: 'Rajdhani, sans-serif' }}>
                  {h._score > 0.5 ? h._score.toFixed(3) : h._score.toFixed(4)} · {coreLabel(h._index)}
                </span>
              </div>
              {h.snippet && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.4)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                  {h.snippet}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CoreQuickSearch({ esUrl, embeddingUrl, embeddingModel }) {
  return (
    <div className="flex flex-col gap-2">
      <VectorRow
        kind="key"
        label="KEY VECTOR SEARCH"
        hint="EMBEDDED KEYS · ALL CORES"
        accent="#7eb8ff"
        icon={KeyRound}
        esUrl={esUrl}
        embeddingUrl={embeddingUrl}
        embeddingModel={embeddingModel}
      />
      <VectorRow
        kind="text"
        label="FULL-TEXT VECTOR SEARCH"
        hint="DOCUMENT TEXT · ALL CORES"
        accent="#00ffcc"
        icon={FileText}
        esUrl={esUrl}
        embeddingUrl={embeddingUrl}
        embeddingModel={embeddingModel}
      />
    </div>
  );
}