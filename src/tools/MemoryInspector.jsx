import React, { useState, useMemo } from 'react';
import { Brain, X, Trash2, Tag, Search, Pin } from 'lucide-react';

const STOP_WORDS = new Set([
  'the','a','an','is','it','in','on','at','to','for','of','and','or','but',
  'i','you','my','your','we','this','that','was','are','have','do','be','with',
  'as','not','from','by','what','how','can','just','like','so','if','then',
  'about','which','there','their','its','would','could','should','more','also',
  'when','were','been','than','into','has','will','some','one','all','they',
]);

export function extractKeywords(text) {
  return [...new Set((text.toLowerCase().match(/\b\w{3,}\b/g) || []))].filter(w => !STOP_WORDS.has(w)).slice(0, 12);
}

export function scoreMemory(memory, inputKeywords) {
  const overlap = memory.keywords.filter(k => inputKeywords.includes(k)).length;
  return overlap;
}

export default function MemoryInspector({ memories, onUpdate, isOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [editTagId, setEditTagId] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [filterTag, setFilterTag] = useState('');

  const allTags = useMemo(() => {
    const set = new Set();
    memories.forEach(m => (m.tags || []).forEach(t => set.add(t)));
    return [...set];
  }, [memories]);

  const filtered = useMemo(() => {
    let list = [...memories].reverse();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.user.toLowerCase().includes(q) || m.ai.toLowerCase().includes(q) || m.keywords.some(k => k.includes(q)));
    }
    if (filterTag) {
      list = list.filter(m => (m.tags || []).includes(filterTag));
    }
    return list;
  }, [memories, search, filterTag]);

  const deleteMemory = (id) => onUpdate(memories.filter(m => m.id !== id));

  const saveTag = (id) => {
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    onUpdate(memories.map(m => m.id === id ? { ...m, tags: [...new Set([...(m.tags || []), ...tags])] } : m));
    setEditTagId(null);
    setTagInput('');
  };

  const removeTag = (id, tag) => {
    onUpdate(memories.map(m => m.id === id ? { ...m, tags: (m.tags || []).filter(t => t !== tag) } : m));
  };

  const pinMemory = (id) => {
    onUpdate(memories.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m));
  };

  // Stats
  const totalKw = useMemo(() => {
    const set = new Set(memories.flatMap(m => m.keywords));
    return set.size;
  }, [memories]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 8200,
      width: 420, maxWidth: '95vw',
      background: 'rgba(0,4,8,0.97)',
      borderRight: '1px solid rgba(0,255,204,0.18)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '8px 0 40px rgba(0,0,0,0.8)',
      fontFamily: 'Rajdhani, sans-serif',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(0,255,204,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Brain size={13} style={{ color: 'var(--neon-primary)' }} />
        <span style={{ flex: 1, fontSize: '0.8rem', letterSpacing: '3px', color: 'var(--neon-primary)', textTransform: 'uppercase' }}>MEMORY INSPECTOR</span>
        <button onClick={() => onUpdate([])} title="Clear all memories"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,80,80,0.45)', padding: '2px 6px' }}>
          <Trash2 size={12} />
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)' }}><X size={14} /></button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '10px 14px', gap: 8, borderBottom: '1px solid rgba(0,255,204,0.08)' }}>
        {[
          { label: 'MEMORIES', value: memories.length },
          { label: 'KEYWORDS', value: totalKw },
          { label: 'TAGGED', value: memories.filter(m => (m.tags || []).length > 0).length },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'rgba(0,255,204,0.04)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '7px 8px', textAlign: 'center' }}>
            <div style={{ color: 'rgba(0,255,204,0.4)', fontSize: '0.55rem', letterSpacing: '1.5px', marginBottom: 3 }}>{label}</div>
            <div style={{ color: 'var(--neon-primary)', fontSize: '1.05rem', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Search + tag filter */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(0,255,204,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="flex items-center gap-2">
          <Search size={11} style={{ color: 'rgba(0,255,204,0.3)', flexShrink: 0 }} />
          <input type="text" placeholder="SEARCH MEMORIES..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 3, fontSize: '0.75rem' }} />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setFilterTag('')}
              style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 10, border: `1px solid ${!filterTag ? 'var(--neon-primary)' : 'rgba(0,255,204,0.15)'}`, color: !filterTag ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: 'transparent', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif' }}>ALL</button>
            {allTags.map(t => (
              <button key={t} onClick={() => setFilterTag(filterTag === t ? '' : t)}
                style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: 10, border: `1px solid ${filterTag === t ? 'var(--neon-primary)' : 'rgba(0,255,204,0.15)'}`, color: filterTag === t ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: 'transparent', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif' }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {/* Memory list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(0,255,204,0.18)', fontSize: '0.75rem', letterSpacing: '2px' }}>
            NO MEMORIES FORMED
          </div>
        )}
        {filtered.map(mem => (
          <div key={mem.id} style={{ margin: '0 10px 8px', borderRadius: 4, border: `1px solid ${mem.pinned ? 'rgba(0,255,204,0.25)' : 'rgba(0,255,204,0.08)'}`, background: mem.pinned ? 'rgba(0,255,204,0.04)' : 'rgba(0,8,8,0.5)' }}>
            <div style={{ padding: '10px 12px' }}>
              {/* Meta */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1px' }}>
                  {new Date(mem.timestamp).toLocaleDateString()} {new Date(mem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => pinMemory(mem.id)} title="Pin/Unpin"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: mem.pinned ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)', padding: '2px' }}>
                  <Pin size={10} />
                </button>
                <button onClick={() => deleteMemory(mem.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.3)', padding: '2px' }}>
                  <Trash2 size={10} />
                </button>
              </div>

              {/* User */}
              <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.6)', marginBottom: 4, lineHeight: 1.4 }}>
                {mem.user.length > 90 ? mem.user.slice(0, 90) + '…' : mem.user}
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-1 mb-2">
                {(mem.keywords || []).map(k => (
                  <span key={k} style={{ fontSize: '0.58rem', padding: '1px 6px', borderRadius: 8, border: '1px solid rgba(0,255,204,0.15)', color: 'rgba(0,255,204,0.5)' }}>{k}</span>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 items-center">
                {(mem.tags || []).map(t => (
                  <span key={t} style={{ fontSize: '0.6rem', padding: '1px 8px', borderRadius: 10, background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.2)', color: 'var(--neon-primary)', cursor: 'pointer' }}
                    onClick={() => removeTag(mem.id, t)}>
                    {t} ×
                  </span>
                ))}
                {editTagId === mem.id ? (
                  <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="tag1, tag2"
                    onKeyDown={e => { if (e.key === 'Enter') saveTag(mem.id); if (e.key === 'Escape') { setEditTagId(null); setTagInput(''); } }}
                    autoFocus style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 3, width: 100 }} />
                ) : (
                  <button onClick={() => setEditTagId(mem.id)} style={{ background: 'none', border: '1px solid rgba(0,255,204,0.12)', borderRadius: 10, cursor: 'pointer', color: 'rgba(0,255,204,0.3)', padding: '1px 7px', fontSize: '0.58rem', fontFamily: 'Rajdhani, sans-serif' }}>
                    + TAG
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}