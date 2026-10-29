import React, { useState } from 'react';
import { loadPresets } from '@/lib/knowledgePresets';

export default function CorePresets({ activeCoreName, onSelect }) {
  const [presets] = useState(loadPresets);

  return (
    <div>
      <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>CORE PRESETS</div>
      <div className="flex flex-wrap gap-1">
        {presets.length === 0 && (
          <span style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
            NO PRESETS DEFINED
          </span>
        )}
        {presets.map(p => {
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