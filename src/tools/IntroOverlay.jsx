import React, { useEffect, useRef } from 'react';

export default function IntroOverlay({ onBoot }) {
  const overlayRef = useRef(null);

  const handleClick = () => {
    const el = overlayRef.current;
    if (!el) return;
    el.style.transition = 'opacity 0.8s ease';
    el.style.opacity = '0';
    setTimeout(() => {
      el.style.display = 'none';
      onBoot();
    }, 800);
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
      style={{ background: 'rgba(0, 5, 5, 0.97)' }}
      onClick={handleClick}
    >
      <div className="relative mb-6 select-none">
        <h1
          className="text-6xl sm:text-8xl font-bold tracking-widest uppercase"
          style={{
            color: 'var(--neon-primary)',
            textShadow: '0 0 40px rgba(0,255,204,0.6), 0 0 80px rgba(0,255,204,0.3)',
            fontFamily: 'Rajdhani, sans-serif',
          }}
        >
          TACTICAL
        </h1>
      </div>

      <p style={{ color: 'rgba(0,255,204,0.5)', letterSpacing: '4px', fontSize: '0.8rem' }}>
        // SYSTEM STANDBY. CLICK TO INITIALIZE //
      </p>

      <div
        className="mt-10 px-12 py-4 rounded text-sm tracking-widest uppercase"
        style={{
          border: '1px solid rgba(0,255,204,0.4)',
          color: 'rgba(0,255,204,0.7)',
          fontFamily: 'Rajdhani, sans-serif',
          transition: 'all 0.3s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(0,255,204,0.1)';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(0,255,204,0.3)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        INITIALIZE SYSTEM
      </div>

      <div className="absolute bottom-6 text-xs tracking-widest opacity-30">
        TACTICAL OS v4.0 — POWERED BY OLLAMA + AURA AI
      </div>
    </div>
  );
}