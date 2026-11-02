import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Loader, AlertTriangle } from 'lucide-react';

import { preferElasticEndpoint } from '@/lib/esEndpoints';
import { OLLAMA_PROXY_URL, ELASTIC_PROXY_URL, resolveLocalEndpoints } from '@/lib/localProxies';

const BL_LS_KEY = 'tactical_browserless_endpoints';
function loadBL() {
  try { return JSON.parse(localStorage.getItem(BL_LS_KEY)) || []; } catch { return []; }
}

const CHECKS = [
  {
    id: 'ollama',
    label: 'OLLAMA',
    desc: 'Local LLM runtime',
    test: async (targets) => {
      const ep = targets.ollama;
      const res = await fetch(`${ep}/v1/models`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const count = (data.data || []).length;
      const base = count > 0 ? `${count} model${count !== 1 ? 's' : ''} available` : 'Connected — no models loaded';
      return `${base} · ${ep === OLLAMA_PROXY_URL ? 'PROXY' : 'DIRECT'}`;
    },
  },
  {
    id: 'elasticsearch',
    label: 'ELASTICSEARCH',
    desc: 'Knowledge index storage',
    test: async (targets) => {
      const ep = targets.elastic;
      const res = await fetch(`${ep}/_cat/health?format=json`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const status = json[0]?.status || 'unknown';
      return `Cluster ${status.toUpperCase()} · ${ep === ELASTIC_PROXY_URL ? 'PROXY' : 'DIRECT'}`;
    },
  },
  {
    id: 'browserless',
    label: 'BROWSERLESS',
    desc: 'Web scraping engine',
    optional: true,
    test: async () => {
      const eps = loadBL();
      if (!eps.length) throw new Error('No endpoints configured');
      const ep = eps[0];
      const headers = ep.token ? { Authorization: `Bearer ${ep.token}` } : {};
      const res = await fetch(`${ep.url}/`, { headers, signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return `${eps.length} node${eps.length !== 1 ? 's' : ''} reachable`;
    },
  },
  {
    id: 'speech',
    label: 'SPEECH API',
    desc: 'Voice synthesis & recognition',
    test: async () => {
      const hasSynth = 'speechSynthesis' in window;
      const hasRec = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
      if (!hasSynth && !hasRec) throw new Error('Not supported in this browser');
      const parts = [];
      if (hasSynth) parts.push('TTS');
      if (hasRec) parts.push('STT');
      return parts.join(' + ') + ' available';
    },
  },
];

function StatusIcon({ status }) {
  if (status === 'pending') return <Loader size={13} style={{ color: 'rgba(0,255,204,0.3)' }} />;
  if (status === 'running') return <Loader size={13} className="animate-spin" style={{ color: 'var(--neon-primary)' }} />;
  if (status === 'ok')      return <CheckCircle size={13} style={{ color: '#00cc66' }} />;
  if (status === 'warn')    return <AlertTriangle size={13} style={{ color: '#ffaa00' }} />;
  if (status === 'error')   return <XCircle size={13} style={{ color: '#ff4444' }} />;
  return null;
}

export default function IntroOverlay({ onBoot }) {
  const overlayRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | checking | done
  const [results, setResults] = useState(() => CHECKS.map(c => ({ id: c.id, status: 'pending', msg: '' })));
  const [canBoot, setCanBoot] = useState(false);

  const runChecks = async () => {
    setPhase('checking');
    const updated = CHECKS.map(c => ({ id: c.id, status: 'pending', msg: '' }));
    setResults([...updated]);

    // Internal proxies when the local network answers, direct local ports otherwise
    const targets = await resolveLocalEndpoints(true);
    preferElasticEndpoint(targets.elastic);

    for (let i = 0; i < CHECKS.length; i++) {
      const check = CHECKS[i];
      updated[i] = { ...updated[i], status: 'running' };
      setResults([...updated]);
      try {
        const msg = await check.test(targets);
        updated[i] = { id: check.id, status: 'ok', msg };
      } catch (e) {
        updated[i] = { id: check.id, status: check.optional ? 'warn' : 'error', msg: e.message };
      }
      setResults([...updated]);
    }

    setPhase('done');
    const critical = CHECKS.filter(c => !c.optional);
    const allCriticalOk = critical.every(c => updated.find(r => r.id === c.id)?.status === 'ok');
    setCanBoot(allCriticalOk);
  };

  const handleBoot = () => {
    const el = overlayRef.current;
    if (!el) return;
    el.style.transition = 'opacity 0.8s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; onBoot(); }, 800);
  };

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'rgba(0,5,5,0.97)' }}>
      
      {/* Title */}
      <h1 className="font-bold tracking-widest uppercase mb-2"
        style={{ color: 'var(--neon-primary)', textShadow: '0 0 40px rgba(0,255,204,0.6), 0 0 80px rgba(0,255,204,0.3)', fontFamily: 'Rajdhani, sans-serif', fontSize: 'clamp(2.5rem, 8vw, 5rem)' }}>
        TACTICAL
      </h1>
      <p style={{ color: 'rgba(0,255,204,0.4)', letterSpacing: '4px', fontSize: '0.7rem', marginBottom: 40 }}>
        // SYSTEM DIAGNOSTICS //
      </p>

      {/* Diagnostics panel */}
      <div style={{ width: '100%', maxWidth: 420, background: 'rgba(0,10,10,0.8)', border: '1px solid rgba(0,255,204,0.12)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(0,255,204,0.08)', fontSize: '0.58rem', letterSpacing: '3px', color: 'rgba(0,255,204,0.35)' }}>
          PREREQUISITE CHECK
        </div>
        {CHECKS.map((check, i) => {
          const r = results[i];
          const color = r.status === 'ok' ? '#00cc66' : r.status === 'warn' ? '#ffaa00' : r.status === 'error' ? '#ff4444' : 'rgba(0,255,204,0.35)';
          return (
            <div key={check.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(0,255,204,0.05)' }}>
              <StatusIcon status={r.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.72rem', letterSpacing: '2px', color: 'rgba(0,255,204,0.8)' }}>{check.label}</span>
                  {check.optional && <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1px' }}>OPTIONAL</span>}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{check.desc}</div>
              </div>
              <div style={{ fontSize: '0.62rem', color, textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Rajdhani, sans-serif' }}>
                {r.msg || (r.status === 'pending' ? '—' : '')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {phase === 'idle' && (
        <button className="neon-btn px-10 py-3 rounded text-sm tracking-widest" onClick={runChecks}>
          RUN DIAGNOSTICS
        </button>
      )}

      {phase === 'checking' && (
        <div style={{ color: 'rgba(0,255,204,0.4)', fontSize: '0.7rem', letterSpacing: '3px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader size={12} className="animate-spin" /> SCANNING SYSTEMS...
        </div>
      )}

      {phase === 'done' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="neon-btn px-6 py-2 rounded text-xs tracking-widest" onClick={runChecks}>
            ↻ RECHECK
          </button>
          {canBoot ? (
            <button className="neon-btn px-10 py-3 rounded text-sm tracking-widest font-bold" onClick={handleBoot}
              style={{ borderColor: '#00cc66', color: '#00cc66' }}>
              ▶ INITIALIZE
            </button>
          ) : (
            <button className="neon-btn px-10 py-3 rounded text-sm tracking-widest" onClick={handleBoot}
              style={{ borderColor: '#ffaa00', color: '#ffaa00', opacity: 0.8 }}>
              ⚠ OVERRIDE &amp; BOOT
            </button>
          )}
        </div>
      )}

      <div className="absolute bottom-6 text-xs tracking-widest opacity-30" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
        TACTICAL OS v4.0 — POWERED BY OLLAMA + AURA AI
      </div>
    </div>
  );
}