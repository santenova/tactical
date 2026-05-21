import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Clock, Plus, Trash2, RefreshCw } from 'lucide-react';

const SCHED_LS_KEY = 'tactical_core_schedules';

function loadSchedules() {
  try { return JSON.parse(localStorage.getItem(SCHED_LS_KEY)) || []; } catch { return []; }
}
function saveSchedules(s) { localStorage.setItem(SCHED_LS_KEY, JSON.stringify(s)); }

const INTERVAL_OPTIONS = [
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '3 hours', ms: 3 * 60 * 60 * 1000 },
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '12 hours', ms: 12 * 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
];

export default function SchedulerPanel({ onTriggerScrape, availableQueries = [] }) {
  const [schedules, setSchedules] = useState(loadSchedules);
  const [newQuery, setNewQuery] = useState('');
  const [newInterval, setNewInterval] = useState(INTERVAL_OPTIONS[2].ms);
  const [tickLog, setTickLog] = useState([]);
  const timersRef = useRef({});
  const countdownRef = useRef({});
  const [countdowns, setCountdowns] = useState({});

  const appendLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTickLog(prev => [...prev.slice(-99), { ts, msg }]);
  }, []);

  // Tick countdowns every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdowns(prev => {
        const next = { ...prev };
        schedules.forEach(s => {
          if (!s.enabled) return;
          const remaining = (next[s.id] ?? s.intervalMs) - 1000;
          next[s.id] = remaining <= 0 ? s.intervalMs : remaining;
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [schedules]);

  // Set up/tear down timers when schedules change
  useEffect(() => {
    // Clear all existing timers
    Object.values(timersRef.current).forEach(clearInterval);
    timersRef.current = {};

    schedules.forEach(s => {
      if (!s.enabled) return;
      timersRef.current[s.id] = setInterval(() => {
        appendLog(`[SCHEDULER] Triggering scrape for: "${s.query}"`);
        onTriggerScrape?.(s.query);
        setCountdowns(prev => ({ ...prev, [s.id]: s.intervalMs }));
      }, s.intervalMs);
    });

    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
    };
  }, [schedules, appendLog, onTriggerScrape]);

  const addSchedule = () => {
    const q = newQuery.trim() || availableQueries[0];
    if (!q) return;
    const s = {
      id: Date.now().toString(),
      query: q,
      intervalMs: newInterval,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    const next = [...schedules, s];
    setSchedules(next);
    saveSchedules(next);
    setCountdowns(prev => ({ ...prev, [s.id]: newInterval }));
    setNewQuery('');
    appendLog(`[SCHEDULER] Added schedule for "${q}" every ${INTERVAL_OPTIONS.find(o => o.ms === newInterval)?.label}`);
  };

  const removeSchedule = (id) => {
    clearInterval(timersRef.current[id]);
    delete timersRef.current[id];
    const next = schedules.filter(s => s.id !== id);
    setSchedules(next);
    saveSchedules(next);
  };

  const toggleSchedule = (id) => {
    const next = schedules.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setSchedules(next);
    saveSchedules(next);
    const s = next.find(x => x.id === id);
    if (s) appendLog(`[SCHEDULER] "${s.query}" ${s.enabled ? 'RESUMED' : 'PAUSED'}`);
  };

  const formatCountdown = (ms) => {
    if (!ms || ms < 0) return '--:--';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* LEFT — Add + schedules list */}
      <div className="flex flex-col gap-3 lg:w-96">
        <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>ADD SCHEDULE</div>

        <div style={{ background: 'rgba(0,255,204,0.03)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '12px' }} className="flex flex-col gap-3">
          <div>
            <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', marginBottom: 4 }}>QUERY TOPIC</div>
            {availableQueries.length > 0 ? (
              <select value={newQuery || availableQueries[0]} onChange={e => setNewQuery(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 3, fontSize: '0.75rem' }}>
                {availableQueries.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            ) : (
              <input type="text" value={newQuery} onChange={e => setNewQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSchedule()}
                placeholder="Enter search topic..."
                style={{ width: '100%', padding: '6px 10px', borderRadius: 3, fontSize: '0.75rem' }}
              />
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.57rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', marginBottom: 4 }}>INTERVAL</div>
            <div className="flex flex-wrap gap-1">
              {INTERVAL_OPTIONS.map(o => (
                <button key={o.ms} onClick={() => setNewInterval(o.ms)}
                  style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.62rem', letterSpacing: '1.5px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${newInterval === o.ms ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: newInterval === o.ms ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: newInterval === o.ms ? 'rgba(0,255,204,0.07)' : 'transparent' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button className="neon-btn px-3 py-2 rounded text-xs flex items-center justify-center gap-2 tracking-widest" onClick={addSchedule}>
            <Plus size={11} /> ADD SCHEDULE
          </button>
        </div>

        <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>
          ACTIVE SCHEDULES ({schedules.filter(s => s.enabled).length}/{schedules.length})
        </div>

        {schedules.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(0,255,204,0.2)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.7rem' }}>
            NO SCHEDULES CONFIGURED
          </div>
        )}

        <div className="flex flex-col gap-2">
          {schedules.map(s => {
            const opt = INTERVAL_OPTIONS.find(o => o.ms === s.intervalMs);
            const cd = countdowns[s.id];
            return (
              <div key={s.id} style={{ background: 'rgba(0,255,204,0.03)', border: `1px solid ${s.enabled ? 'rgba(0,255,204,0.15)' : 'rgba(0,255,204,0.07)'}`, borderRadius: 4, padding: '10px 12px' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Clock size={10} style={{ color: s.enabled ? 'var(--neon-primary)' : 'rgba(0,255,204,0.25)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.72rem', color: s.enabled ? 'var(--neon-primary)' : 'rgba(0,255,204,0.35)', fontFamily: 'Rajdhani, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.query}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.enabled && cd != null && (
                      <span style={{ fontSize: '0.62rem', color: '#ffaa00', letterSpacing: '1px', fontFamily: 'monospace' }}>{formatCountdown(cd)}</span>
                    )}
                    <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>{opt?.label || `${s.intervalMs / 60000}m`}</span>
                    <button onClick={() => toggleSchedule(s.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.enabled ? '#00cc66' : 'rgba(0,255,204,0.3)', padding: 2 }}>
                      {s.enabled ? <Square size={11} /> : <Play size={11} />}
                    </button>
                    <button onClick={() => removeSchedule(s.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.4)', padding: 2 }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT — Trigger log */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>TRIGGER LOG</span>
          <button onClick={() => setTickLog([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.25)', fontSize: '0.6rem', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>CLEAR</button>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '10px 12px', flex: 1, minHeight: 300, maxHeight: '60vh', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {tickLog.length === 0 && <span style={{ color: 'rgba(0,255,204,0.2)', letterSpacing: '1px' }}>Scheduler active — triggers will appear here...</span>}
          {tickLog.map((e, i) => (
            <div key={i} className="flex gap-3">
              <span style={{ color: 'rgba(0,255,204,0.25)', flexShrink: 0 }}>{e.ts}</span>
              <span style={{ color: 'rgba(0,255,204,0.65)' }}>{e.msg}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.2)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif' }}>
          ⚠ Schedules run while this tab is open. They will reset on page refresh.
        </div>
      </div>
    </div>
  );
}