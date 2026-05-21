import React from 'react';

export default function HoverCloud({ desc, pos }) {
  if (!desc) return null;
  return (
    <div
      className="fixed z-50 pointer-events-none px-3 py-1.5 rounded text-xs tracking-widest uppercase"
      style={{
        top: pos.y,
        left: pos.x,
        background: 'rgba(0,10,10,0.9)',
        border: '1px solid rgba(0,255,204,0.3)',
        color: 'var(--neon-primary)',
        fontFamily: 'Rajdhani, sans-serif',
        boxShadow: '0 0 10px rgba(0,255,204,0.2)',
        whiteSpace: 'nowrap',
        opacity: desc ? 1 : 0,
        transition: 'opacity 0.15s',
      }}
    >
      {desc}
    </div>
  );
}