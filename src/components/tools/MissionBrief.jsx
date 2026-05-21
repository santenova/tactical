import React, { useState } from 'react';
import { Target, Plus, Trash2, X, Pin, PinOff, Edit2, Check } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const CATEGORIES = ['IDENTITY', 'MISSION', 'RULES', 'CONTEXT', 'FACTS', 'OTHER'];

const CAT_COLORS = {
  IDENTITY: '#00ffcc',
  MISSION:  '#ffaa00',
  RULES:    '#ff3333',
  CONTEXT:  '#8ab4f8',
  FACTS:    '#cc44ff',
  OTHER:    'rgba(0,255,204,0.4)',
};

const EMPTY_FORM = { title: '', content: '', category: 'CONTEXT' };

export default function MissionBrief({ items, onChange }) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filterCat, setFilterCat] = useState('ALL');
  const [formError, setFormError] = useState('');

  const pinned = items.filter(i => i.pinned);

  const startNew = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); setFormError(''); };
  const startEdit = (item) => { setForm({ title: item.title, content: item.content, category: item.category }); setEditingId(item.id); setShowForm(true); setFormError(''); };

  const saveForm = () => {
    if (!form.title.trim()) { setFormError('Title required'); return; }
    if (!form.content.trim()) { setFormError('Content required'); return; }
    if (editingId) {
      onChange(items.map(i => i.id === editingId ? { ...i, ...form } : i));
    } else {
      onChange([...items, { id: Date.now(), ...form, pinned: true }]);
    }
    setShowForm(false); setEditingId(null); setFormError('');
  };

  const togglePin = (id) => onChange(items.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i));
  const remove = (id) => onChange(items.filter(i => i.id !== id));

  const visible = filterCat === 'ALL' ? items : items.filter(i => i.category === filterCat);

  return (
    <>
      <button
        className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1"
        onClick={() => setOpen(true)}
        data-desc="Open Mission Brief Memory Bank"
        style={{ borderColor: pinned.length > 0 ? '#ffaa00' : undefined, color: pinned.length > 0 ? '#ffaa00' : undefined }}
      >
        <Target size={12} /> BRIEF
        {pinned.length > 0 && (
          <span className="ml-1 rounded-full px-1.5" style={{ background: 'rgba(255,170,0,0.2)', color: '#ffaa00', fontSize: '0.6rem' }}>
            {pinned.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }} onClick={() => setOpen(false)}>
          <div
            className="ml-auto h-full flex flex-col"
            style={{ width: '520px', maxWidth: '95vw', background: 'rgba(0,6,6,0.98)', borderLeft: '1px solid rgba(255,170,0,0.2)', boxShadow: '-10px 0 50px rgba(255,170,0,0.05)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,170,0,0.15)' }}>
              <div className="flex items-center gap-2">
                <Target size={14} style={{ color: '#ffaa00' }} />
                <span className="text-xs tracking-widest uppercase" style={{ color: '#ffaa00' }}>MISSION BRIEF</span>
                <span className="text-xs opacity-40 tracking-wider">— PERSISTENT MEMORY</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1" style={{ borderColor: '#ffaa00', color: '#ffaa00' }} onClick={startNew}>
                  <Plus size={10} /> NEW
                </button>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,170,0,0.4)', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Pinned summary bar */}
            <div className="px-4 py-2 flex-shrink-0 flex items-center gap-2" style={{ background: 'rgba(255,170,0,0.05)', borderBottom: '1px solid rgba(255,170,0,0.08)' }}>
              <Pin size={10} style={{ color: '#ffaa00' }} />
              <span className="text-xs tracking-widest" style={{ color: 'rgba(255,170,0,0.7)' }}>
                {pinned.length === 0 ? 'NO FACTS PINNED — AI HAS NO PERSISTENT CONTEXT' : `${pinned.length} FACT${pinned.length > 1 ? 'S' : ''} ACTIVE IN AI MEMORY`}
              </span>
            </div>

            {/* Form */}
            {showForm && (
              <div className="flex flex-col gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,170,0,0.1)', background: 'rgba(255,170,0,0.03)' }}>
                <div className="flex gap-2">
                  <input
                    type="text" className="flex-1 px-2 py-1 rounded text-xs" placeholder="Fact title (e.g. My Name, Project Goal...)"
                    value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    style={{ borderColor: 'rgba(255,170,0,0.3)' }}
                  />
                  <select className="px-2 py-1 rounded text-xs" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    style={{ borderColor: 'rgba(255,170,0,0.3)', color: CAT_COLORS[form.category] }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <textarea
                  className="w-full rounded px-2 py-2 text-xs resize-none"
                  rows={4}
                  placeholder="Enter the fact, rule, or context the AI should always remember..."
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  style={{ fontFamily: 'monospace', fontSize: '0.75rem', borderColor: 'rgba(255,170,0,0.3)' }}
                />
                {formError && <span className="text-xs" style={{ color: 'var(--neon-alert)' }}>{formError}</span>}
                <div className="flex gap-2">
                  <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" style={{ borderColor: '#ffaa00', color: '#ffaa00' }} onClick={saveForm}>
                    <Check size={10} /> {editingId ? 'UPDATE' : 'SAVE & PIN'}
                  </button>
                  <button className="neon-btn px-3 py-1 rounded text-xs" onClick={() => { setShowForm(false); setFormError(''); }}>CANCEL</button>
                </div>
              </div>
            )}

            {/* Category filter */}
            <div className="flex gap-1 flex-wrap px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,170,0,0.06)' }}>
              {['ALL', ...CATEGORIES].map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className="px-2 py-0.5 rounded text-xs tracking-widest uppercase transition-all"
                  style={{
                    fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', cursor: 'pointer',
                    background: filterCat === c ? 'rgba(255,170,0,0.12)' : 'transparent',
                    border: `1px solid ${filterCat === c ? 'rgba(255,170,0,0.4)' : 'rgba(255,170,0,0.1)'}`,
                    color: filterCat === c ? (c === 'ALL' ? '#ffaa00' : CAT_COLORS[c]) : 'rgba(255,170,0,0.35)',
                  }}>
                  {c}
                </button>
              ))}
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {visible.length === 0 && (
                <div className="text-center mt-10 text-xs tracking-widest opacity-30 uppercase">
                  {items.length === 0 ? 'No facts yet.\nAdd your first mission brief entry.' : 'No items in this category.'}
                </div>
              )}
              {visible.map(item => {
                const color = CAT_COLORS[item.category] || CAT_COLORS.OTHER;
                return (
                  <div key={item.id}
                    className="rounded flex flex-col gap-2"
                    style={{
                      background: item.pinned ? 'rgba(255,170,0,0.06)' : 'rgba(0,15,15,0.6)',
                      border: `1px solid ${item.pinned ? 'rgba(255,170,0,0.3)' : 'rgba(0,255,204,0.06)'}`,
                      padding: '10px 12px',
                      boxShadow: item.pinned ? '0 0 10px rgba(255,170,0,0.05)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {item.pinned && <Pin size={9} style={{ color: '#ffaa00', flexShrink: 0 }} />}
                          <span className="text-sm font-semibold truncate" style={{ color: item.pinned ? '#ffaa00' : 'rgba(255,255,255,0.7)', fontFamily: 'Rajdhani, sans-serif' }}>
                            {item.title}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-xs flex-shrink-0" style={{ background: `${color}18`, color, fontSize: '0.55rem', letterSpacing: '1px', border: `1px solid ${color}33` }}>
                            {item.category}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'rgba(0,255,204,0.5)', fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-word' }}>
                          {item.content}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        <button onClick={() => togglePin(item.id)} title={item.pinned ? 'Unpin from AI memory' : 'Pin to AI memory'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: item.pinned ? '#ffaa00' : 'rgba(255,170,0,0.3)', transition: 'color 0.2s' }}>
                          {item.pinned ? <Pin size={13} /> : <PinOff size={13} />}
                        </button>
                        <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: 'rgba(0,255,204,0.3)' }}>
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => remove(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: 'rgba(255,51,51,0.4)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 flex-shrink-0 text-center" style={{ borderTop: '1px solid rgba(255,170,0,0.08)', fontSize: '0.65rem', color: 'rgba(255,170,0,0.25)', letterSpacing: '2px' }}>
              PINNED FACTS ARE INJECTED INTO EVERY AI QUERY · PERSISTENT ACROSS SESSIONS
            </div>
          </div>
        </div>
      )}
    </>
  );
}