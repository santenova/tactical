import React, { useState, useEffect, useCallback } from 'react';
import { Library, RefreshCw, Trash2, Plus, Save, Download, ChevronRight, ChevronDown } from 'lucide-react';

const chip = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.66rem', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(0,255,204,0.25)', color: 'rgba(0,255,204,0.75)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' };
const label = { fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 5 };
const miniBtn = { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.58rem', letterSpacing: '1px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)', padding: '2px 4px' };

// Every personal core is one index per preset per user: <preset>_core_<user id>
export default function PersonalCores({ esUrl, userId, onQueue, onSelectCore, log }) {
  const [cores, setCores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [drafts, setDrafts] = useState({});
  const [dirty, setDirty] = useState({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const ownSuffix = String(userId || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

  const loadCores = useCallback(async () => {
    if (!esUrl) { setCores([]); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${esUrl}/_cat/indices?format=json&h=index,docs.count`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = (json || [])
        .filter(i => /_core_/.test(i.index) && !i.index.startsWith('knowledge_core_') && !i.index.startsWith('.'))
        .map(i => ({ index: i.index, docs: parseInt(i['docs.count'] || '0', 10) || 0 }))
        .sort((a, b) => {
          const aOwn = ownSuffix && a.index.endsWith(ownSuffix) ? 1 : 0;
          const bOwn = ownSuffix && b.index.endsWith(ownSuffix) ? 1 : 0;
          return bOwn - aOwn || a.index.localeCompare(b.index);
        });
      setCores(list);
      setSelected(prev => (prev && list.some(c => c.index === prev)) ? prev : (list[0]?.index || ''));
    } catch (e) {
      setError(e.message); setCores([]);
    } finally { setLoading(false); }
  }, [esUrl, ownSuffix]);

  useEffect(() => { loadCores(); }, [loadCores]);

  const loadSets = useCallback(async () => {
    if (!esUrl || !selected) { setSets([]); return; }
    setSetsLoading(true);
    try {
      const res = await fetch(`${esUrl}/${selected}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 200, query: { match_all: {} } }),
      });
      if (!res.ok) { setSets([]); return; }
      const json = await res.json();
      setSets((json.hits?.hits || [])
        .map(h => ({ id: h._id, ...h._source }))
        .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || ''))));
      setDirty({});
    } catch { setSets([]); }
    finally { setSetsLoading(false); }
  }, [esUrl, selected]);

  useEffect(() => { loadSets(); }, [loadSets]);

  // Edit the keyword list of one saved set, locally
  const updateKeywords = (id, fn) => {
    setSets(prev => prev.map(s => s.id === id ? { ...s, keywords: fn(s.keywords || []) } : s));
    setDirty(prev => ({ ...prev, [id]: true }));
  };

  const removeKeyword = (id, k) => updateKeywords(id, list => list.filter(x => x !== k));

  const addKeyword = (id) => {
    const k = String(drafts[id] || '').trim().toLowerCase();
    if (!k) return;
    updateKeywords(id, list => list.includes(k) ? list : [...list, k]);
    setDrafts(prev => ({ ...prev, [id]: '' }));
  };

  const persist = async (set) => {
    setBusyId(set.id); setError('');
    try {
      const res = await fetch(`${esUrl}/${selected}/_update/${set.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: { keywords: set.keywords || [] } }),
      });
      if (!res.ok) throw new Error(`Update HTTP ${res.status}`);
      setDirty(prev => ({ ...prev, [set.id]: false }));
      log?.(`[PERSONAL] Saved ${(set.keywords || []).length} keywords to ${selected}`, 'ok');
    } catch (e) { setError(e.message); log?.(`[PERSONAL] ${e.message}`, 'error'); }
    finally { setBusyId(''); }
  };

  const removeSet = async (set) => {
    setBusyId(set.id); setError('');
    try {
      const res = await fetch(`${esUrl}/${selected}/_doc/${set.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete HTTP ${res.status}`);
      setSets(prev => prev.filter(s => s.id !== set.id));
      log?.(`[PERSONAL] Removed a set from ${selected}`, 'ok');
      loadCores();
    } catch (e) { setError(e.message); log?.(`[PERSONAL] ${e.message}`, 'error'); }
    finally { setBusyId(''); }
  };

  return (
    <div style={{ background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.12)', borderRadius: 4, padding: '10px 12px' }} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Library size={12} style={{ color: 'var(--neon-primary)' }} />
        <span className="neon-text flex-1" style={{ fontSize: '0.6rem', letterSpacing: '2px' }}>PERSONAL CORES</span>
        <button onClick={loadCores} disabled={loading} style={{ ...miniBtn, color: 'rgba(0,255,204,0.45)' }} title="Refresh list">
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!esUrl && <div style={{ fontSize: '0.65rem', color: 'rgba(255,100,100,0.6)' }}>Configure an Elasticsearch endpoint first</div>}

      {esUrl && cores.length === 0 && !loading && (
        <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1.5px' }}>
          NO PERSONAL CORES YET — REFINE A PRESET TO CREATE ONE
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {cores.map(c => {
          const on = selected === c.index;
          return (
            <button key={c.index} onClick={() => { setSelected(c.index); setExpanded(''); onSelectCore?.(c.index); }}
              title={`${c.index} — ${c.docs} saved sets`}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '1px', padding: '3px 8px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${on ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: on ? 'rgba(0,255,204,0.08)' : 'transparent', color: on ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)' }}>
              {c.index.replace(/_core_.*$/, '')}
              <span style={{ opacity: 0.4, marginLeft: 5 }}>{c.docs}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px', wordBreak: 'break-all' }}>
          SELECTED: <span style={{ color: 'rgba(0,255,204,0.45)' }}>{selected}</span>
        </div>
      )}

      {error && <div style={{ color: '#ff4444', fontSize: '0.65rem' }}>{error}</div>}

      {selected && (
        <div className="flex flex-col gap-1">
          <div style={label}>SAVED SETS ({sets.length}){setsLoading ? ' …' : ''}</div>
          {sets.length === 0 && !setsLoading && (
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.2)', letterSpacing: '1.5px' }}>NO SETS IN THIS CORE</div>
          )}
          {sets.map(s => {
            const open = expanded === s.id;
            const kws = s.keywords || [];
            return (
              <div key={s.id} style={{ border: '1px solid rgba(0,255,204,0.1)', borderRadius: 3 }}>
                <div className="flex items-center gap-1" style={{ padding: '3px 6px' }}>
                  <button onClick={() => setExpanded(open ? '' : s.id)}
                    style={{ ...miniBtn, display: 'flex', alignItems: 'center', gap: 4, flex: 1, color: 'rgba(0,255,204,0.65)', textAlign: 'left' }}>
                    {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <span style={{ flex: 1, textTransform: 'uppercase' }}>{s.preset || 'UNKNOWN'}</span>
                    <span style={{ opacity: 0.45 }}>{kws.length}</span>
                    {dirty[s.id] && <span style={{ color: '#ffaa00', fontSize: '0.55rem' }}>●</span>}
                  </button>
                  <button onClick={() => onQueue?.(kws)} style={miniBtn} title="Add keywords to the ingest queue">
                    <Download size={10} />
                  </button>
                  <button onClick={() => removeSet(s)} disabled={busyId === s.id}
                    style={{ ...miniBtn, color: 'rgba(255,60,60,0.45)' }} title="Delete this set">
                    <Trash2 size={10} />
                  </button>
                </div>

                {open && (
                  <div className="flex flex-col gap-2" style={{ padding: '4px 8px 8px', background: 'rgba(0,0,0,0.35)' }}>
                    {s.user_message && (
                      <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '0.5px' }}>“{s.user_message}”</div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {kws.length === 0 && <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.2)' }}>NO KEYWORDS</span>}
                      {kws.map(k => (
                        <span key={k} style={chip}>
                          {k}
                          <button onClick={() => removeKeyword(s.id, k)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.5)', padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <input type="text" value={drafts[s.id] || ''}
                        onChange={e => setDrafts(prev => ({ ...prev, [s.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addKeyword(s.id)}
                        placeholder="Add keyword..."
                        style={{ flex: 1, padding: '3px 7px', borderRadius: 3, fontSize: '0.68rem' }} />
                      <button className="neon-btn px-2 py-1 rounded text-xs" onClick={() => addKeyword(s.id)}><Plus size={9} /></button>
                      <button className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1"
                        onClick={() => persist(s)} disabled={busyId === s.id || !dirty[s.id]}
                        title="Save edits to the personal core">
                        <Save size={9} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}