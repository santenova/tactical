import React, { useState } from 'react';
import { Layers, Plus, Trash2, Pencil, Save, X, RotateCcw } from 'lucide-react';
import PageShell from '@/components/tools/PageShell';
import KeywordGraph from '@/components/tools/KeywordGraph';
import { loadPresets, savePresets, DEFAULT_PRESETS, PRESET_COLORS, slugifyPresetName } from '@/lib/knowledgePresets';

const EMPTY_DRAFT = { name: '', label: '', color: PRESET_COLORS[0], queriesText: '' };

const fieldLabel = { fontSize: '0.58rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 4 };

export default function KnowledgePresets() {
  const [presets, setPresets] = useState(loadPresets);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  const commit = (next) => {
    setPresets(next);
    savePresets(next);
  };

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setEditingIndex(null);
    setError('');
    setFormOpen(true);
  };

  const openEdit = (i) => {
    const p = presets[i];
    setDraft({ name: p.name, label: p.label, color: p.color, queriesText: (p.queries || []).join('\n') });
    setEditingIndex(i);
    setError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditingIndex(null);
    setError('');
  };

  const save = () => {
    const name = slugifyPresetName(draft.name);
    if (!name) { setError('A core name is required (letters, numbers, underscores)'); return; }
    const queries = draft.queriesText.split('\n').map(q => q.trim()).filter(Boolean);
    if (queries.length === 0) { setError('Add at least one query, one per line'); return; }
    if (presets.some((p, i) => p.name === name && i !== editingIndex)) { setError(`A preset named "${name}" already exists`); return; }
    const preset = { name, label: draft.label.trim() || name.toUpperCase(), color: draft.color, queries };
    const next = editingIndex == null ? [...presets, preset] : presets.map((p, i) => (i === editingIndex ? preset : p));
    commit(next);
    flash(editingIndex == null ? `Preset "${preset.label}" created` : `Preset "${preset.label}" updated`);
    closeForm();
  };

  const remove = (i) => {
    const p = presets[i];
    if (!window.confirm(`Delete the "${p.label}" preset?`)) return;
    commit(presets.filter((_, idx) => idx !== i));
    if (editingIndex === i) closeForm();
    flash(`Preset "${p.label}" deleted`);
  };

  const resetDefaults = () => {
    if (!window.confirm('Restore the original preset categories? Your custom presets will be replaced.')) return;
    commit(DEFAULT_PRESETS);
    closeForm();
    flash('Default presets restored');
  };

  return (
    <PageShell
      title="KNOWLEDGE PRESETS"
      subtitle="PRESET CATEGORIES THAT ORGANISE YOUR KNOWLEDGE CORES IN THE INGEST TAB"
      icon={Layers}
    >
      <div className="tactical-panel rounded p-4 flex flex-col gap-4" style={{ minHeight: '70vh' }}>

        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
            {presets.length} PRESET{presets.length === 1 ? '' : 'S'}
          </span>
          {notice && <span style={{ fontSize: '0.6rem', color: '#00cc66', letterSpacing: '1.5px' }}>● {notice.toUpperCase()}</span>}
          <div className="ml-auto flex gap-2">
            <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={resetDefaults}>
              <RotateCcw size={10} /> RESET DEFAULTS
            </button>
            <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={openNew}>
              <Plus size={11} /> NEW PRESET
            </button>
          </div>
        </div>

        {/* Editor */}
        {formOpen && (
          <div style={{ background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.18)', borderRadius: 5, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.62rem', color: 'var(--neon-primary)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif', flex: 1 }}>
                {editingIndex == null ? '⬡ NEW PRESET' : `⬡ EDITING: ${presets[editingIndex]?.label}`}
              </span>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', padding: 2 }}>
                <X size={12} />
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              <div style={{ flex: '1 1 200px' }}>
                <div style={fieldLabel}>DISPLAY LABEL</div>
                <input type="text" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                  placeholder="⬡ SCIENCE" style={{ width: '100%', padding: '6px 10px', borderRadius: 3, fontSize: '0.78rem' }} />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <div style={fieldLabel}>CORE NAME</div>
                <input type="text" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="science" style={{ width: '100%', padding: '6px 10px', borderRadius: 3, fontSize: '0.78rem' }} />
                <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.25)', marginTop: 3, letterSpacing: '1px' }}>
                  Index becomes: knowledge_core_{slugifyPresetName(draft.name) || '…'}
                </div>
              </div>
            </div>

            <div>
              <div style={fieldLabel}>ACCENT COLOUR</div>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setDraft(d => ({ ...d, color: c }))}
                    title={c}
                    style={{ width: 20, height: 20, borderRadius: 3, cursor: 'pointer', background: c, border: draft.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)', boxShadow: draft.color === c ? `0 0 8px ${c}` : 'none' }}
                  />
                ))}
              </div>
            </div>

            <div>
              <div style={fieldLabel}>STARTER QUERIES — ONE PER LINE</div>
              <textarea value={draft.queriesText} onChange={e => setDraft(d => ({ ...d, queriesText: e.target.value }))}
                rows={5} placeholder={'physics fundamentals\nchemistry reactions'} className="w-full rounded px-3 py-2"
                style={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
              <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.25)', marginTop: 3, letterSpacing: '1px' }}>
                {draft.queriesText.split('\n').map(q => q.trim()).filter(Boolean).length} QUERIES
              </div>
            </div>

            {error && <div style={{ color: '#ff4444', fontSize: '0.72rem', padding: '6px 10px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

            <div className="flex gap-2">
              <button className="neon-btn px-4 py-2 rounded text-xs flex items-center gap-2" onClick={save}>
                <Save size={11} /> SAVE PRESET
              </button>
              <button className="neon-btn px-4 py-2 rounded text-xs" onClick={closeForm}>CANCEL</button>
            </div>
          </div>
        )}

        {/* Preset list */}
        {presets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(0,255,204,0.2)', fontSize: '0.75rem', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
            NO PRESETS — CREATE ONE OR RESTORE THE DEFAULTS
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {presets.map((p, i) => (
              <div key={`${p.name}-${i}`} style={{ background: 'rgba(0,255,204,0.02)', border: `1px solid ${p.color}33`, borderLeft: `2px solid ${p.color}`, borderRadius: 4, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.8rem', letterSpacing: '2px', color: p.color, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </span>
                  <button onClick={() => openEdit(i)} title="Edit preset" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', padding: 2 }}>
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => remove(i)} title="Delete preset" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.45)', padding: 2 }}>
                    <Trash2 size={11} />
                  </button>
                </div>

                <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
                  CORE: <span style={{ color: 'rgba(0,255,204,0.55)' }}>knowledge_core_{p.name}</span> · {p.queries.length} QUERIES
                </div>

                <div className="flex flex-wrap gap-1">
                  {p.queries.map((q, qi) => (
                    <span key={qi} style={{ fontSize: '0.6rem', padding: '1px 7px', borderRadius: 10, border: `1px solid ${p.color}33`, color: 'rgba(0,255,204,0.5)', fontFamily: 'Rajdhani, sans-serif' }}>
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <KeywordGraph />

        <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
          SAVED LOCALLY — APPLY A PRESET FROM THE MAIN APP'S ◉ CORE ▸ INGEST TAB
        </div>
      </div>
    </PageShell>
  );
}