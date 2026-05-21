import React, { useEffect, useRef } from 'react';
import { STATE, DEFAULT_ORB_SETTINGS } from '../../pages/Home';

export default function OrbFullscreen({ mode, statusText, transcript, orbSettings, onClose, onOrbClick }) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const timeRef = useRef(0);
  const filamentsRef = useRef([]);
  const rafRef = useRef(null);
  const settingsRef = useRef({ ...DEFAULT_ORB_SETTINGS, ...orbSettings });

  // Keep refs in sync synchronously during render so animation loop always reads current values
  modeRef.current = mode;
  settingsRef.current = { ...DEFAULT_ORB_SETTINGS, ...orbSettings };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function getNeonColor() {
      return getComputedStyle(document.documentElement).getPropertyValue('--neon-primary').trim() || '#00ffcc';
    }
    function getNeonSecondary() {
      return getComputedStyle(document.documentElement).getPropertyValue('--neon-secondary').trim() || '#00f3ff';
    }

    function buildFilaments(count) {
      const arr = [];
      // Fullscreen uses 1.5x filaments for denser display
      const fsCount = Math.round(count * 1.5);
      for (let i = 0; i < fsCount; i++) {
        const angle = (Math.PI * 2 / fsCount) * i;
        arr.push({
          angle,
          baseLength: 120 + Math.random() * 80,
          speed: 0.4 + Math.random(),
          offset: Math.random() * Math.PI * 2,
          useSecondary: Math.random() > 0.5,
        });
      }
      return arr;
    }

    filamentsRef.current = buildFilaments(settingsRef.current.filamentCount);
    let lastFilamentCount = settingsRef.current.filamentCount;

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function animate() {
      const cfg = settingsRef.current;

      if (cfg.filamentCount !== lastFilamentCount) {
        filamentsRef.current = buildFilaments(cfg.filamentCount);
        lastFilamentCount = cfg.filamentCount;
      }

      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const radius = Math.min(w, h) * 0.3;
      const m = modeRef.current;

      ctx.fillStyle = 'rgba(0, 3, 3, 0.18)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'screen';

      let volatility = 1, surge = 0;
      if (m === STATE.speaking)  { volatility = cfg.speakingVolatility; surge = cfg.speakingSurge * 2; }
      else if (m === STATE.thinking) { volatility = cfg.thinkingVolatility; surge = cfg.thinkingSurge; }
      else if (m === STATE.listening) { volatility = cfg.listeningVolatility; surge = cfg.listeningSurge; }
      else if (m === STATE.crisis)   { volatility = cfg.crisisVolatility; }

      filamentsRef.current.forEach(f => {
        const t = timeRef.current;
        const movement = Math.sin(t * f.speed + f.offset) * (12 * volatility);
        const currentLen = f.baseLength + movement + surge;
        const x1 = cx + Math.cos(f.angle) * (radius * 0.3);
        const y1 = cy + Math.sin(f.angle) * (radius * 0.3);
        const cpX = cx + Math.cos(f.angle + t * 0.1) * (currentLen * 0.6);
        const cpY = cy + Math.sin(f.angle + t * 0.1) * (currentLen * 0.6);
        const x2 = cx + Math.cos(f.angle) * currentLen;
        const y2 = cy + Math.sin(f.angle) * currentLen;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cpX, cpY, x2, y2);
        ctx.strokeStyle = m === STATE.crisis ? '#ff0000' : (f.useSecondary ? getNeonSecondary() : getNeonColor());
        ctx.globalAlpha = m === STATE.speaking ? 0.65 : 0.35;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      let pupilSize = radius * 0.2;
      if (m === STATE.speaking) pupilSize = radius * 0.17 + Math.sin(timeRef.current * 5) * 5;
      if (m === STATE.listening) pupilSize = radius * 0.25;
      if (m === STATE.crisis) pupilSize = radius * 0.1;
      ctx.arc(cx, cy, pupilSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.ellipse(cx - pupilSize * 0.5, cy - pupilSize * 0.5, pupilSize * 0.25, pupilSize * 0.15, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      timeRef.current += cfg.animSpeed;
      rafRef.current = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  const neon = 'var(--neon-primary)';
  const crisisColor = mode === STATE.crisis ? '#ff0000' : neon;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column' }}>
      <div className="scanlines" />

      <button onClick={onClose}
        style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 100, fontFamily: 'Rajdhani, sans-serif', fontSize: '0.75rem', letterSpacing: '3px', background: 'transparent', border: `1px solid ${crisisColor}`, color: crisisColor, padding: '6px 14px', borderRadius: '3px', cursor: 'pointer', textTransform: 'uppercase' }}
        data-desc="Exit Fullscreen Orb"
      >
        ✕ EXIT
      </button>

      <div style={{ position: 'absolute', top: '1.5rem', left: 0, right: 0, textAlign: 'center', zIndex: 2, fontFamily: 'Rajdhani, sans-serif', fontSize: '0.8rem', letterSpacing: '0.4em', color: crisisColor, textShadow: `0 0 12px ${crisisColor}88`, textTransform: 'uppercase' }}>
        {statusText}
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'pointer' }}
        onClick={onOrbClick}
        title="Click to interrupt"
      />

      {transcript && (
        <div style={{ position: 'absolute', bottom: '3rem', left: 0, right: 0, textAlign: 'center', zIndex: 2, fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.85)', padding: '0 2rem' }}>
          {transcript}
        </div>
      )}

      <div style={{ position: 'absolute', bottom: '1rem', left: 0, right: 0, textAlign: 'center', zIndex: 2, fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '3px', color: 'rgba(128,128,128,0.3)', textTransform: 'uppercase' }}>
        TACTICAL — FULLSCREEN ORB — CLICK TO INTERRUPT
      </div>
    </div>
  );
}