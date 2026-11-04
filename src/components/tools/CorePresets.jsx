import React, { useState } from 'react';
import { loadPresets } from '@/lib/knowledgePresets';

export default function CorePresets({ activeCoreName, onSelect }) {
  const [presets] = useState(loadPresets);
  const [filter, setFilter] = useState('');

  // The preset bank is large, so a term narrows it by label, name or any of its queries
  const term = filter.trim().toLowerCase();
  const shown = term
    ? presets.filter(p =>
        [p.label, p.name, ...(p.queries || [])].join(' ').toLowerCase().includes(term)
      )
    : presets;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>CORE PRESETS</span>
        <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>
          {shown.length}/{presets.length}
        </span>
      </div>
      <input type="text" value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter presets..."
        style={{ width: '100%', padding: '4px 8px', borderRadius: 3, fontSize: '0.7rem', marginBottom: 5 }}
      />
      <div className="flex flex-wrap gap-1" style={{ maxHeight: 168, overflowY: 'auto' }}>
        {presets.length === 0 && (
          <span style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
            NO PRESETS DEFINED
          </span>
        )}
        {shown.length === 0 && presets.length > 0 && (
          <span style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
            NO MATCH
          </span>
        )}
        {shown.map(p => {
          const isActive = activeCoreName === p.name;
          return (
            <button key={p.name} onClick={() => onSelect(p)}
              title={`Load ${p.label} preset — ${(p.queries || []).length} starter queries`}
              style={{
                fontFamily: 'Rajdhani, sans-serif', fontSize: '0.62rem', letterSpacing: '1.5px',
                padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
                border: `1px solid ${isActive ? p.color : 'rgba(0,255,204,0.2)'}`,
                color: isActive ? p.color : 'rgba(0,255,204,0.45)',
                background: isActive ? `${p.color}14` : 'transparent',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = `${p.color}88`; e.currentTarget.style.color = p.color; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(0,255,204,0.2)'; e.currentTarget.style.color = 'rgba(0,255,204,0.45)'; } }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}