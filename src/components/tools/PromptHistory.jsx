import React, { useState } from 'react';
import { History, X, Trash2, ChevronRight } from 'lucide-react';

export default function PromptHistory({ history, onLoad, onClear }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" onClick={() => setOpen(true)} data-desc="View Prompt History" title="Prompt History">
        <History size={12} /> HISTORY
        {history.length > 0 && (
          <span className="ml-1 rounded-full px-1.5 text-xs" style={{ background: 'rgba(0,255,204,0.2)', color: 'var(--neon-primary)', fontSize: '0.6rem' }}>
            {history.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setOpen(false)} />
      )}

      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{ width: '360px', background: 'rgba(0,10,10,0.97)', borderLeft: '1px solid rgba(0,255,204,0.2)', boxShadow: '-8px 0 40px rgba(0,255,204,0.05)', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s ease' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(0,255,204,0.1)' }}>
          <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-primary)' }}>PROMPT HISTORY</span>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button className="neon-btn neon-btn-danger px-2 py-1 rounded text-xs flex items-center gap-1" onClick={onClear} title="Clear all history">
                <Trash2 size={10} /> CLEAR ALL
              </button>
            )}
            <button onClick={() => setOpen(false)} style={{ color: 'rgba(0,255,204,0.5)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
          {history.length === 0 && (
            <div className="text-center mt-12 text-xs tracking-widest opacity-30 uppercase">
              No history yet.<br />Successful runs will appear here.
            </div>
          )}
          {[...history].reverse().map((item) => (
            <div
              key={item.id}
              className="rounded p-3 cursor-pointer flex flex-col gap-1"
              style={{ background: 'rgba(0,20,20,0.6)', border: '1px solid rgba(0,255,204,0.1)', transition: 'border-color 0.2s, background 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,255,204,0.35)'; e.currentTarget.style.background = 'rgba(0,30,30,0.8)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,255,204,0.1)'; e.currentTarget.style.background = 'rgba(0,20,20,0.6)'; }}
              onClick={() => { onLoad(item); setOpen(false); }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-snug flex-1 line-clamp-2" style={{ color: 'rgba(0,255,204,0.85)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.5px' }}>{item.prompt}</p>
                <ChevronRight size={12} style={{ color: 'rgba(0,255,204,0.3)', flexShrink: 0, marginTop: '2px' }} />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs opacity-30 tracking-widest">{item.model}</span>
                <span className="text-xs opacity-25">{item.time}</span>
                <span className="text-xs opacity-25 ml-auto">{item.tokens} tok</span>
              </div>
              <p className="text-xs line-clamp-1 mt-0.5" style={{ color: 'rgba(0,255,204,0.3)', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                {item.output.slice(0, 80)}…
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}