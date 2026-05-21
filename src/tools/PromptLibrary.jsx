import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, X, Tag, Edit2, Check } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const INITIAL_TEMPLATES = [
  { id: 1, name: 'React Component', category: 'Coding', tags: ['react', 'javascript', 'ui'], content: 'Create a React functional component called [ComponentName] that:\n- [DESCRIBE BEHAVIOR]\n- Uses Tailwind CSS for styling\n- Is fully self-contained with no external dependencies\n\nReturn only the complete component code.' },
  { id: 2, name: 'HTML Landing Page', category: 'Coding', tags: ['html', 'css', 'landing'], content: 'Write a complete single-file HTML landing page for [PRODUCT/SERVICE]. Include:\n- A hero section with headline and CTA button\n- Features section with 3 cards\n- Footer\nUse inline CSS only. Make it look modern and professional.' },
  { id: 3, name: "Explain Like I'm 5", category: 'Explanation', tags: ['simple', 'education'], content: "Explain [CONCEPT] as if I'm 5 years old. Use simple words, a short analogy, and no jargon. Keep it under 100 words." },
  { id: 4, name: 'Code Review', category: 'Coding', tags: ['review', 'quality'], content: 'Review the following code for bugs, performance issues, and best practice violations. Provide specific, actionable suggestions:\n\n```\n[PASTE CODE HERE]\n```' },
  { id: 5, name: 'SQL Query Builder', category: 'Data', tags: ['sql', 'database'], content: 'Write an optimized SQL query to [DESCRIBE WHAT YOU NEED]. Table structure:\n\n[DESCRIBE TABLES AND COLUMNS]\n\nInclude comments explaining any complex parts.' },
  { id: 6, name: 'System Prompt Designer', category: 'AI', tags: ['system-prompt', 'ai-engineering'], content: 'Design a detailed system prompt for an AI assistant that:\n- Role: [DESCRIBE THE ROLE]\n- Tone: [e.g. professional, friendly, concise]\n- Constraints: [e.g. no harmful content, stay on topic]\n- Output format: [e.g. bullet points, markdown]\n\nMake the system prompt clear and specific.' },
];

const CATEGORIES = ['All', 'Coding', 'Explanation', 'Data', 'AI', 'Creative', 'Other'];

export default function PromptLibrary({ onInsert }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useLocalStorage('tactical_prompt_library', INITIAL_TEMPLATES);
  const [filterCat, setFilterCat] = useState('All');
  const [filterTag, setFilterTag] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Coding', tags: '', content: '' });
  const [formError, setFormError] = useState('');

  const allTags = [...new Set(templates.flatMap(t => t.tags))];
  const filtered = templates.filter(t => {
    if (filterCat !== 'All' && t.category !== filterCat) return false;
    if (filterTag && !t.tags.includes(filterTag)) return false;
    return true;
  });

  const startEdit = (tpl) => { setForm({ name: tpl.name, category: tpl.category, tags: tpl.tags.join(', '), content: tpl.content }); setEditingId(tpl.id); setShowForm(true); setFormError(''); };
  const startNew = () => { setForm({ name: '', category: 'Coding', tags: '', content: '' }); setEditingId(null); setShowForm(true); setFormError(''); };

  const saveForm = () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.content.trim()) { setFormError('Content is required'); return; }
    const tags = form.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (editingId) { setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, ...form, tags } : t)); }
    else { setTemplates(prev => [...prev, { id: Date.now(), ...form, tags }]); }
    setShowForm(false); setEditingId(null); setFormError('');
  };

  const handleInsert = (content) => { onInsert(content); setOpen(false); };

  return (
    <>
      <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={() => setOpen(true)} data-desc="Open Prompt Library">
        <BookOpen size={12} /> LIBRARY
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }} onClick={() => setOpen(false)}>
          <div className="ml-auto h-full flex flex-col" style={{ width: '480px', maxWidth: '95vw', background: 'rgba(0,8,8,0.98)', borderLeft: '1px solid rgba(0,255,204,0.2)', boxShadow: '-10px 0 50px rgba(0,255,204,0.06)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,255,204,0.1)' }}>
              <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-primary)' }}>PROMPT LIBRARY</span>
              <div className="flex items-center gap-2">
                <button className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1" onClick={startNew}><Plus size={10} /> NEW</button>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(0,255,204,0.4)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
            </div>

            {showForm && (
              <div className="flex flex-col gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,255,204,0.1)', background: 'rgba(0,20,20,0.4)' }}>
                <div className="flex gap-2">
                  <input type="text" className="flex-1 px-2 py-1 rounded text-xs" placeholder="Template name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  <select className="px-2 py-1 rounded text-xs" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <input type="text" className="w-full px-2 py-1 rounded text-xs" placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
                <textarea className="w-full rounded px-2 py-2 text-xs resize-none" rows={6} placeholder="Prompt content. Use [PLACEHOLDERS] for customizable parts." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                {formError && <span className="text-xs" style={{ color: 'var(--neon-alert)' }}>{formError}</span>}
                <div className="flex gap-2">
                  <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={saveForm}><Check size={10} /> {editingId ? 'UPDATE' : 'SAVE'}</button>
                  <button className="neon-btn px-3 py-1 rounded text-xs" onClick={() => { setShowForm(false); setFormError(''); }}>CANCEL</button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,255,204,0.08)' }}>
              <div className="flex gap-1 flex-wrap">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setFilterCat(c)} className="px-2 py-0.5 rounded text-xs tracking-widest uppercase transition-all"
                    style={{ background: filterCat === c ? 'rgba(0,255,204,0.15)' : 'transparent', border: `1px solid ${filterCat === c ? 'rgba(0,255,204,0.4)' : 'rgba(0,255,204,0.1)'}`, color: filterCat === c ? 'var(--neon-primary)' : 'rgba(0,255,204,0.35)', fontFamily: 'Rajdhani, sans-serif', cursor: 'pointer', fontSize: '0.6rem' }}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {filterTag && (
                  <button onClick={() => setFilterTag('')} className="px-2 py-0.5 rounded text-xs flex items-center gap-1" style={{ background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.3)', color: 'var(--neon-primary)', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem' }}>
                    <X size={8} /> {filterTag}
                  </button>
                )}
                {allTags.filter(t => t !== filterTag).slice(0, 12).map(t => (
                  <button key={t} onClick={() => setFilterTag(t)} className="px-2 py-0.5 rounded text-xs flex items-center gap-1" style={{ background: 'transparent', border: '1px solid rgba(0,255,204,0.08)', color: 'rgba(0,255,204,0.3)', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem' }}>
                    <Tag size={7} /> {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {filtered.length === 0 && <div className="text-center mt-10 text-xs tracking-widest opacity-30 uppercase">No templates found</div>}
              {filtered.map(tpl => (
                <div key={tpl.id} className="rounded flex flex-col gap-2" style={{ background: 'rgba(0,20,20,0.6)', border: '1px solid rgba(0,255,204,0.08)', padding: '12px' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm tracking-wide" style={{ color: 'rgba(0,255,204,0.9)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600 }}>{tpl.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded inline-block" style={{ background: 'rgba(0,255,204,0.08)', color: 'rgba(0,255,204,0.5)', fontSize: '0.6rem', letterSpacing: '1px' }}>{tpl.category}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button className="neon-btn px-2 py-1 rounded text-xs" onClick={() => handleInsert(tpl.content)} style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>INSERT</button>
                      <button onClick={() => startEdit(tpl)} style={{ background: 'none', border: 'none', color: 'rgba(0,255,204,0.3)', cursor: 'pointer', padding: '4px' }}><Edit2 size={11} /></button>
                      <button onClick={() => setTemplates(prev => prev.filter(t => t.id !== tpl.id))} style={{ background: 'none', border: 'none', color: 'rgba(255,51,51,0.4)', cursor: 'pointer', padding: '4px' }}><Trash2 size={11} /></button>
                    </div>
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: 'rgba(0,255,204,0.3)', fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: 1.5 }}>{tpl.content}</p>
                  <div className="flex gap-1 flex-wrap">
                    {tpl.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-xs flex items-center gap-0.5" style={{ background: 'rgba(0,255,204,0.05)', color: 'rgba(0,255,204,0.3)', fontSize: '0.6rem', border: '1px solid rgba(0,255,204,0.08)' }}>
                        <Tag size={7} /> {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}