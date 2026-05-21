import React, { useEffect, useRef } from 'react';
import { STATE, DEFAULT_ORB_SETTINGS } from '../../pages/Home';

export default function OrbCanvas({ mode, statusText, transcript, orbSettings, onOrbClick, onFullscreen }) {
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
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        arr.push({
          angle,
          baseLength: 60 + Math.random() * 40,
          speed: 0.5 + Math.random(),
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

      // Rebuild filaments if count changed
      if (cfg.filamentCount !== lastFilamentCount) {
        filamentsRef.current = buildFilaments(cfg.filamentCount);
        lastFilamentCount = cfg.filamentCount;
      }

      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const radius = Math.min(w, h) * 0.35;
      const m = modeRef.current;

      ctx.fillStyle = 'rgba(0, 5, 5, 0.2)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'screen';

      let volatility = 1, surge = 0;
      if (m === STATE.speaking)  { volatility = cfg.speakingVolatility; surge = cfg.speakingSurge; }
      else if (m === STATE.thinking) { volatility = cfg.thinkingVolatility; surge = cfg.thinkingSurge; }
      else if (m === STATE.listening) { volatility = cfg.listeningVolatility; surge = cfg.listeningSurge; }
      else if (m === STATE.crisis)   { volatility = cfg.crisisVolatility; }

      filamentsRef.current.forEach(f => {
        const t = timeRef.current;
        const movement = Math.sin(t * f.speed + f.offset) * (10 * volatility);
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
        ctx.globalAlpha = m === STATE.speaking ? 0.6 : 0.3;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      let pupilSize = radius * 0.2;
      if (m === STATE.speaking) pupilSize = radius * 0.17 + Math.sin(timeRef.current * 5) * 3;
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

  const crisisColor = mode === STATE.crisis ? 'red' : 'var(--neon-primary)';

  return (
    <div className="tactical-panel rounded p-3 flex flex-col gap-2 h-full">
      <div className="text-xs tracking-widest uppercase text-center" style={{ color: crisisColor, textShadow: `0 0 10px ${crisisColor}40` }}>
        {statusText}
      </div>

      <canvas
        ref={canvasRef}
        className="w-full rounded cursor-pointer"
        style={{ height: '200px', filter: 'blur(0.3px) contrast(1.2)' }}
        onClick={onOrbClick}
        title="Click to interrupt"
      />

      <div className="text-center text-sm min-h-[2rem] px-2" style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 300 }}>
        {transcript}
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="text-xs tracking-widest opacity-30">TACTICAL v2.0</div>
        <button
          onClick={onFullscreen}
          data-desc="Open Orb Fullscreen"
          style={{
            fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px',
            background: 'transparent', border: `1px solid ${crisisColor}55`, color: `${crisisColor}99`,
            padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = crisisColor; e.currentTarget.style.color = crisisColor; e.currentTarget.style.boxShadow = `0 0 8px ${crisisColor}66`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = `${crisisColor}55`; e.currentTarget.style.color = `${crisisColor}99`; e.currentTarget.style.boxShadow = 'none'; }}
        >
          ⛶ FULLSCREEN
        </button>
      </div>
    </div>
  );
}