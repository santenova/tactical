import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Save, Plus, Trash2, X, Download, Library } from 'lucide-react';
import { normalizeOllamaUrl } from '@/lib/localProxies';

// Personal knowledge bases live in one index per preset per user: <preset>_core_<user id>
export function personalCoreIndex(presetName, userId) {
  const slug = String(presetName || 'personal').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'personal';
  const id = String(userId || 'anon').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return `${slug}_core_${id}`;
}

const chip = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.66rem', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(0,255,204,0.25)', color: 'rgba(0,255,204,0.75)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' };
const label = { fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 5 };

export default function CoreRefiner({ preset, esUrl, ollamaUrl, model, userId, onApply, onClose, log }) {
  const [message, setMessage] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [draft, setDraft] = useState('');
  const [sets, setSets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const index = personalCoreIndex(preset?.name, userId);

  const loadSets = useCallback(async () => {
    if (!esUrl || !userId) { setSets([]); return; }
    try {
      const res = await fetch(`${esUrl}/${index}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 20, sort: [{ created_date: 'desc' }], query: { term: { owner_id: userId } } }),
      });
      if (!res.ok) { setSets([]); return; }
      const json = await res.json();
      setSets((json.hits?.hits || []).map(h => ({ id: h._id, ...h._source })));
    } catch { setSets([]); }
  }, [esUrl, userId, index]);

  useEffect(() => { loadSets(); }, [loadSets]);

  // OpenAI-compatible call to the configured AI — returns a refined keyword set
  const refine = useCallback(async () => {
    if (!message.trim()) { setError('Add a message describing the refinement'); return; }
    setBusy(true); setError('');
    log?.(`[REFINER] Refining "${preset.label}" via ${model}...`, 'dim');
    try {
      const res = await fetch(`${normalizeOllamaUrl(ollamaUrl)}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            {
              role: 'system',
              content: 'You refine knowledge-base search presets. Reply with ONLY a JSON array of 10 to 16 short, specific search keywords or phrases (lowercase, no duplicates, no explanations, no markdown).',
            },
            {
              role: 'user',
              content: `PRESET: ${preset.label}\nBASE KEYWORDS: ${(preset.queries || []).join(', ')}\nUSER REQUEST: ${message.trim()}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content || '';
      const match = raw.match(/\[[\s\S]*?\]/);
      if (!match) throw new Error('No keyword array in the response');
      const list = JSON.parse(match[0]).map(k => String(k).trim().toLowerCase()).filter(Boolean);
      if (list.length === 0) throw new Error('Refinement came back empty');
      setKeywords([...new Set(list)]);
      log?.(`[REFINER] ${list.length} refined keywords generated`, 'ok');
    } catch (e) {
      setError(e.message);
      log?.(`[REFINER] ${e.message}`, 'error');
    } finally { setBusy(false); }
  }, [message, preset, ollamaUrl, model, log]);

  // Store the refined set under the user's prefixed personal core, then queue it
  const save = useCallback(async () => {
    if (!esUrl) { setError('Configure an Elasticsearch endpoint first'); return; }
    if (!userId) { setError('Sign in to keep a personal knowledge base'); return; }
    if (keywords.length === 0) { setError('Refine the preset first'); return; }
    setBusy(true); setError('');
    try {
      const head = await fetch(`${esUrl}/${index}`);
      if (head.status === 404) {
        const created = await fetch(`${esUrl}/${index}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mappings: {
              properties: {
                owner_id: { type: 'keyword' },
                preset: { type: 'keyword' },
                user_message: { type: 'text' },
                keywords: { type: 'keyword' },
                created_date: { type: 'date' },
              },
            },
          }),
        });
        if (!created.ok) throw new Error(`Index create HTTP ${created.status}`);
      }
      const doc = await fetch(`${esUrl}/${index}/_doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: userId,
          preset: preset.name,
          user_message: message.trim(),
          keywords,
          created_date: new Date().toISOString(),
        }),
      });
      if (!doc.ok) throw new Error(`Store HTTP ${doc.status}`);
      log?.(`[REFINER] Saved ${keywords.length} keywords to ${index}`, 'ok');
      onApply?.(keywords);
      onClose?.();
    } catch (e) {
      setError(e.message);
      log?.(`[REFINER] ${e.message}`, 'error');
    } finally { setBusy(false); }
  }, [esUrl, userId, index, keywords, preset, message, onApply, onClose, log]);

  const addDraft = () => {
    const k = draft.trim().toLowerCase();
    if (!k) return;
    setKeywords(prev => prev.includes(k) ? prev : [...prev, k]);
    setDraft('');
  };

  return (
    <div style={{ background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.18)', borderRadius: 4, padding: '10px 12px' }} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles size={12} style={{ color: 'var(--neon-primary)' }} />
        <span className="neon-text flex-1" style={{ fontSize: '0.62rem', letterSpacing: '2px' }}>CORE REFINER — {preset.label}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', padding: 2 }}><X size={12} /></button>
      </div>

      <div>
        <div style={label}>PRESET KEYWORDS ({(preset.queries || []).length})</div>
        <div className="flex flex-wrap gap-1">
          {(preset.queries || []).length === 0 && (
            <span style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1.5px' }}>NO STARTER KEYWORDS</span>
          )}
          {(preset.queries || []).map(k => (
            <span key={k} style={{ ...chip, borderStyle: 'dashed', color: 'rgba(0,255,204,0.55)' }}>{k}</span>
          ))}
        </div>
      </div>

      <div>
        <div style={label}>YOUR MESSAGE</div>
        <textarea
          rows={2}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={`Refine "${preset.label}" into sharper, more specific search keywords...`}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 3, fontSize: '0.72rem', resize: 'none' }}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={refine} disabled={busy}>
          <Sparkles size={10} /> {busy ? 'WORKING...' : 'REFINE WITH AI'}
        </button>
        <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1px' }}>MODEL: {model || '—'}</span>
      </div>

      {error && <div style={{ color: '#ff4444', fontSize: '0.68rem' }}>{error}</div>}

      {keywords.length > 0 && (
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
            <span style={label}>REFINED KEYWORDS ({keywords.length})</span>
            <button onClick={() => setKeywords([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.4)', padding: 2 }}><Trash2 size={10} /></button>
          </div>
          <div className="flex flex-wrap gap-1" style={{ marginBottom: 6 }}>
            {keywords.map(k => (
              <span key={k} style={chip}>
                {k}
                <button onClick={() => setKeywords(prev => prev.filter(x => x !== k))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.5)', padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDraft()}
              placeholder="Add keyword..."
              style={{ flex: 1, padding: '3px 8px', borderRadius: 3, fontSize: '0.7rem' }} />
            <button className="neon-btn px-2 py-1 rounded text-xs" onClick={addDraft}><Plus size={10} /></button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={save} disabled={busy || keywords.length === 0}>
          <Save size={10} /> SAVE TO PERSONAL CORE
        </button>
        <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1"
          onClick={() => { onApply?.(keywords); onClose?.(); }} disabled={keywords.length === 0}>
          <Download size={10} /> QUEUE ONLY
        </button>
      </div>
      <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px', wordBreak: 'break-all' }}>
        PERSONAL CORE: <span style={{ color: 'rgba(0,255,204,0.45)' }}>{index}</span>
      </div>

      {sets.length > 0 && (
        <div>
          <div className="flex items-center gap-1" style={{ marginBottom: 5 }}>
            <Library size={10} style={{ color: 'rgba(0,255,204,0.35)' }} />
            <span style={label}>SAVED PERSONAL SETS ({sets.length})</span>
          </div>
          <div className="flex flex-col gap-1">
            {sets.map(s => (
              <div key={s.id} className="flex items-center gap-2" style={{ padding: '3px 8px', border: '1px solid rgba(0,255,204,0.08)', borderRadius: 3 }}>
                <span style={{ flex: 1, fontSize: '0.68rem', color: 'rgba(0,255,204,0.6)', fontFamily: 'Rajdhani, sans-serif' }}>
                  {s.preset} · {(s.keywords || []).length} keywords
                </span>
                <button onClick={() => setKeywords([...new Set(s.keywords || [])])}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)', fontSize: '0.58rem', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>
                  LOAD
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}