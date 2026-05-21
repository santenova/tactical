import React, { useEffect, useRef, useState } from 'react';
import { BarChart2, TrendingUp, Circle, Cpu } from 'lucide-react';

const MODES = ['BAR', 'LINE', 'NODES', 'SCATTER'];

/* Extract numeric series from text */
function extractNumbers(text) {
  const matches = text.match(/[-+]?\d+(\.\d+)?/g) || [];
  return matches.map(Number).filter(n => !isNaN(n) && isFinite(n)).slice(0, 24);
}

/* Extract key:value pairs like "queries: 1200, docs: 850" */
function extractPairs(text) {
  const pairs = [];
  const re = /([A-Za-z][\w\s]{0,20})\s*[:=]\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    pairs.push({ label: m[1].trim().slice(0, 12), value: parseFloat(m[2]) });
    if (pairs.length >= 12) break;
  }
  return pairs;
}

function drawBar(ctx, w, h, pairs, color) {
  ctx.clearRect(0, 0, w, h);
  if (!pairs.length) return;
  const pad = { t: 20, r: 20, b: 35, l: 46 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const maxVal = Math.max(...pairs.map(p => p.value), 1);
  const bw = Math.max(6, cw / pairs.length - 6);
  const rgb = hexToRgb(color);

  // axes
  ctx.strokeStyle = `rgba(${rgb},0.15)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, h - pad.b);
  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();

  // y gridlines
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ch / 4) * i;
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.font = '9px Rajdhani, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((maxVal - (maxVal / 4) * i).toFixed(0), pad.l - 4, y + 3);
    ctx.globalAlpha = 1;
  }

  pairs.forEach((p, i) => {
    const x = pad.l + (cw / pairs.length) * i + (cw / pairs.length - bw) / 2;
    const bh = (p.value / maxVal) * ch;
    const y = pad.t + ch - bh;
    const grad = ctx.createLinearGradient(0, y, 0, y + bh);
    grad.addColorStop(0, `rgba(${rgb},0.9)`);
    grad.addColorStop(1, `rgba(${rgb},0.2)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, bw, bh);
    // glow
    ctx.shadowBlur = 8;
    ctx.shadowColor = `rgba(${rgb},0.5)`;
    ctx.fillRect(x, y, bw, 2);
    ctx.shadowBlur = 0;
    // label
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.font = '8px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.label.slice(0, 8), x + bw / 2, h - pad.b + 12);
    ctx.globalAlpha = 1;
  });
}

function drawLine(ctx, w, h, values, color) {
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const pad = { t: 16, r: 16, b: 24, l: 40 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const rgb = hexToRgb(color);

  ctx.strokeStyle = `rgba(${rgb},0.1)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();

  const pts = values.map((v, i) => ({
    x: pad.l + (i / (values.length - 1)) * cw,
    y: pad.t + ch - ((v - min) / (max - min)) * ch,
  }));

  // area fill
  ctx.beginPath();
  ctx.moveTo(pts[0].x, h - pad.b);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, h - pad.b);
  ctx.closePath();
  const areaGrad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  areaGrad.addColorStop(0, `rgba(${rgb},0.2)`);
  areaGrad.addColorStop(1, `rgba(${rgb},0.01)`);
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // line
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 6;
  ctx.shadowColor = `rgba(${rgb},0.5)`;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // dots
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.fill();
  });
}

function drawNodes(ctx, w, h, values, color) {
  ctx.clearRect(0, 0, w, h);
  const rgb = hexToRgb(color);
  const count = Math.min(values.length, 12);
  const centerX = w / 2, centerY = h / 2;
  const radius = Math.min(w, h) * 0.32;

  const nodes = Array.from({ length: count }, (_, i) => ({
    x: centerX + Math.cos((Math.PI * 2 / count) * i - Math.PI / 2) * radius,
    y: centerY + Math.sin((Math.PI * 2 / count) * i - Math.PI / 2) * radius,
    val: values[i],
    size: 4 + (values[i] / Math.max(...values)) * 12,
  }));

  // edges
  nodes.forEach((a, i) => {
    nodes.forEach((b, j) => {
      if (j <= i) return;
      const sim = 1 - Math.abs(a.val - b.val) / (Math.max(...values) + 1);
      if (sim < 0.6) return;
      ctx.globalAlpha = (sim - 0.6) * 0.3;
      ctx.strokeStyle = `rgb(${rgb})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  });
  ctx.globalAlpha = 1;

  // center node
  ctx.beginPath();
  ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb},0.3)`;
  ctx.fill();
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  nodes.forEach(n => {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb},0.15)`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.lineWidth = 1;
    ctx.shadowBlur = 8;
    ctx.shadowColor = `rgba(${rgb},0.4)`;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // edge to center
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(n.x, n.y);
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawScatter(ctx, w, h, values, color) {
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const pad = 30;
  const rgb = hexToRgb(color);
  const minV = Math.min(...values), maxV = Math.max(...values, minV + 1);
  const scale = (v) => pad + ((v - minV) / (maxV - minV)) * (Math.min(w, h) - pad * 2);

  ctx.strokeStyle = `rgba(${rgb},0.08)`;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const gp = pad + (g / 4) * (Math.min(w, h) - pad * 2);
    ctx.beginPath(); ctx.moveTo(gp, pad); ctx.lineTo(gp, h - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, gp); ctx.lineTo(w - pad, gp); ctx.stroke();
  }

  for (let i = 0; i < values.length - 1; i += 2) {
    const x = values[i] !== undefined ? pad + ((values[i] - minV) / (maxV - minV)) * (w - pad * 2) : w / 2;
    const y = values[i + 1] !== undefined ? pad + ((values[i + 1] - minV) / (maxV - minV)) * (h - pad * 2) : h / 2;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb},0.75)`;
    ctx.shadowBlur = 5;
    ctx.shadowColor = `rgba(${rgb},0.4)`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function hexToRgb(hex) {
  if (!hex || !hex.startsWith('#')) return '0,255,204';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export default function CanvasOutput({ output, visible }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState('BAR');

  const neonColor = getComputedStyle(document.documentElement).getPropertyValue('--neon-primary').trim() || '#00ffcc';
  const pairs = extractPairs(output || '');
  const numbers = pairs.length > 0 ? pairs.map(p => p.value) : extractNumbers(output || '');

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    if (numbers.length === 0) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,255,204,0.1)';
      ctx.font = '11px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NO NUMERIC DATA DETECTED', w / 2, h / 2);
      return;
    }
    if (mode === 'BAR') {
      const usePairs = pairs.length > 0 ? pairs : numbers.map((v, i) => ({ label: `#${i + 1}`, value: v }));
      drawBar(ctx, w, h, usePairs, neonColor);
    } else if (mode === 'LINE') {
      drawLine(ctx, w, h, numbers, neonColor);
    } else if (mode === 'NODES') {
      drawNodes(ctx, w, h, numbers, neonColor);
    } else if (mode === 'SCATTER') {
      drawScatter(ctx, w, h, numbers, neonColor);
    }
  }, [output, mode, visible]);

  if (!visible) return null;

  return (
    <div style={{ border: '1px solid rgba(0,255,204,0.12)', borderRadius: 4, overflow: 'hidden', background: 'rgba(0,5,5,0.7)' }}>
      <div className="flex items-center gap-1 px-3 py-1.5" style={{ borderBottom: '1px solid rgba(0,255,204,0.08)' }}>
        <BarChart2 size={10} style={{ color: 'var(--neon-primary)' }} />
        <span style={{ fontSize: '0.6rem', letterSpacing: '2px', color: 'rgba(0,255,204,0.5)', flex: 1 }}>CANVAS OUTPUT</span>
        <div className="flex gap-1">
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.58rem', letterSpacing: '1px', padding: '2px 7px', borderRadius: 2, cursor: 'pointer', border: `1px solid ${mode === m ? 'var(--neon-primary)' : 'rgba(0,255,204,0.15)'}`, color: mode === m ? 'var(--neon-primary)' : 'rgba(0,255,204,0.35)', background: mode === m ? 'rgba(0,255,204,0.07)' : 'transparent' }}
            >{m}</button>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} width={480} height={180} style={{ width: '100%', display: 'block' }} />
      {numbers.length > 0 && (
        <div style={{ padding: '4px 10px', fontSize: '0.6rem', color: 'rgba(0,255,204,0.3)', borderTop: '1px solid rgba(0,255,204,0.06)' }}>
          {numbers.length} data points detected
        </div>
      )}
    </div>
  );
}