import React, { useEffect, useRef } from 'react';

/* ── Per-persona effect definitions ─────────────────────────────────────── */
const EFFECTS = {
  tactical: {
    bg: 'rgba(0,5,5,0.18)',
    color: '#00ffcc',
    particles: 55,
    particleSpeed: 0.35,
    scanlines: true,
    scanlineAlpha: 0.018,
    grid: false,
    noise: false,
    glitch: false,
  },
  oracle: {
    bg: 'rgba(5,3,0,0.16)',
    color: '#ffaa00',
    particles: 80,
    particleSpeed: 0.18,
    scanlines: false,
    scanlineAlpha: 0,
    grid: false,
    noise: true,
    noiseAlpha: 0.025,
    glitch: false,
  },
  sentinel: {
    bg: 'rgba(5,0,0,0.2)',
    color: '#ff2222',
    particles: 30,
    particleSpeed: 0.9,
    scanlines: true,
    scanlineAlpha: 0.012,
    grid: true,
    noise: false,
    glitch: false,
    sweep: true,
  },
  ghost: {
    bg: 'rgba(4,6,10,0.22)',
    color: '#8ab4f8',
    particles: 20,
    particleSpeed: 0.12,
    scanlines: false,
    scanlineAlpha: 0,
    grid: false,
    noise: true,
    noiseAlpha: 0.04,
    glitch: false,
  },
  nemesis: {
    bg: 'rgba(4,0,8,0.2)',
    color: '#cc44ff',
    particles: 40,
    particleSpeed: 0.7,
    scanlines: false,
    scanlineAlpha: 0,
    grid: true,
    noise: false,
    glitch: true,
    glitchRate: 0.015,
  },
  stealth: {
    bg: 'rgba(0,0,0,0.3)',
    color: '#e0e0e0',
    particles: 15,
    particleSpeed: 0.08,
    scanlines: true,
    scanlineAlpha: 0.008,
    grid: false,
    noise: true,
    noiseAlpha: 0.055,
    glitch: false,
  },
};

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function makeParticles(count, w, h, cfg) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * cfg.particleSpeed,
    vy: (Math.random() - 0.5) * cfg.particleSpeed,
    alpha: 0.1 + Math.random() * 0.45,
    radius: 0.8 + Math.random() * 1.6,
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.01 + Math.random() * 0.03,
  }));
}

export default function PersonaBackground({ personaId }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cfg = EFFECTS[personaId] || EFFECTS.tactical;
    const rgb = hexToRgb(cfg.color);

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      particles.splice(0, particles.length, ...makeParticles(cfg.particles, w, h, cfg));
    };
    window.addEventListener('resize', onResize);

    const particles = makeParticles(cfg.particles, w, h, cfg);

    // Noise buffer
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 256;
    noiseCanvas.height = 256;
    const nctx = noiseCanvas.getContext('2d');

    // Sweep state (sentinel)
    let sweepY = 0;

    // Glitch state (nemesis)
    let glitchTimer = 0;
    let glitchActive = false;
    let glitchLines = [];

    let frame = 0;

    function drawNoise() {
      const imgData = nctx.createImageData(256, 256);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255 | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      nctx.putImageData(imgData, 0, 0);
    }

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      if (!w || !h || !isFinite(w) || !isFinite(h)) return;
      ctx.clearRect(0, 0, w, h);

      // Background fade
      ctx.fillStyle = cfg.bg;
      ctx.fillRect(0, 0, w, h);

      // ── Digital noise ─────────────────────────────────────────────────
      if (cfg.noise) {
        if (frame % 3 === 0) drawNoise(); // update noise every 3 frames
        ctx.globalAlpha = cfg.noiseAlpha;
        for (let tx = 0; tx < w; tx += 256) {
          for (let ty = 0; ty < h; ty += 256) {
            ctx.drawImage(noiseCanvas, tx, ty);
          }
        }
        ctx.globalAlpha = 1;
      }

      // ── Scanlines ─────────────────────────────────────────────────────
      if (cfg.scanlines) {
        ctx.globalAlpha = cfg.scanlineAlpha;
        ctx.fillStyle = `rgb(${rgb})`;
        for (let y = 0; y < h; y += 4) {
          ctx.fillRect(0, y, w, 1);
        }
        ctx.globalAlpha = 1;
      }

      // ── Grid ──────────────────────────────────────────────────────────
      if (cfg.grid) {
        const spacing = 60;
        const pulse = 0.04 + Math.abs(Math.sin(frame * 0.012)) * 0.04;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let gx = 0; gx < w; gx += spacing) {
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
        }
        for (let gy = 0; gy < h; gy += spacing) {
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ── Radar sweep (sentinel) ─────────────────────────────────────────
      if (cfg.sweep && h > 0) {
        sweepY = (sweepY + cfg.particleSpeed * 1.8) % h;
        const y0 = isFinite(sweepY) ? sweepY - 40 : 0;
        const y1 = isFinite(sweepY) ? sweepY + 6 : 1;
        const grad = ctx.createLinearGradient(0, y0, 0, y1);
        grad.addColorStop(0, `rgba(${rgb},0)`);
        grad.addColorStop(1, `rgba(${rgb},0.08)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, sweepY - 40, w, 46);
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.fillRect(0, sweepY, w, 1);
        ctx.globalAlpha = 1;
      }

      // ── Particles ─────────────────────────────────────────────────────
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.twinkle += p.twinkleSpeed;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        const alpha = p.alpha * (0.5 + 0.5 * Math.sin(p.twinkle));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Connection lines for close pairs (oracle / nemesis)
        if (personaId === 'oracle' || personaId === 'nemesis') {
          particles.forEach(q => {
            const dx = p.x - q.x, dy = p.y - q.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 90 && dist > 0) {
              ctx.globalAlpha = (1 - dist / 90) * 0.06;
              ctx.strokeStyle = `rgb(${rgb})`;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          });
        }
      });
      ctx.globalAlpha = 1;

      // ── Glitch slices (nemesis) ────────────────────────────────────────
      if (cfg.glitch) {
        glitchTimer++;
        if (!glitchActive && Math.random() < cfg.glitchRate) {
          glitchActive = true;
          glitchLines = Array.from({ length: 3 + Math.random() * 5 | 0 }, () => ({
            y: Math.random() * h,
            height: 2 + Math.random() * 10,
            offset: (Math.random() - 0.5) * 60,
            life: 3 + Math.random() * 6 | 0,
          }));
        }
        if (glitchActive) {
          glitchLines = glitchLines.filter(l => l.life-- > 0);
          glitchLines.forEach(l => {
            ctx.globalAlpha = 0.18;
            const slice = ctx.getImageData(0, l.y, w, l.height);
            ctx.putImageData(slice, l.offset, l.y);
            ctx.fillStyle = `rgba(${rgb},0.06)`;
            ctx.fillRect(0, l.y, w, l.height);
          });
          if (glitchLines.length === 0) glitchActive = false;
          ctx.globalAlpha = 1;
        }
      }

      frame++;
    }

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [personaId]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.9,
      }}
    />
  );
}