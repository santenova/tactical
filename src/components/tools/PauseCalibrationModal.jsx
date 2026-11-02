import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, X, RotateCcw, Check } from 'lucide-react';

const SENTENCE = 'Tactical system online. The orb listens quietly, waits for the full sentence, then answers the command.';
const TARGET_WORDS = SENTENCE.split(/\s+/).length;
const MAX_DURATION = 25000;
const MIN_GAP = 120;
const MAX_GAP = 2000;

export default function PauseCalibrationModal({ isOpen, onClose, currentThreshold = 800, onApply, onStateChange }) {
  const [status, setStatus] = useState('idle'); // idle | listening | done | error
  const [heard, setHeard] = useState('');
  const [gaps, setGaps] = useState([]);
  const [suggested, setSuggested] = useState(null);
  const [error, setError] = useState('');

  const recRef = useRef(null);
  const stampsRef = useRef([]);
  const maxTimerRef = useRef(null);
  const finishedRef = useRef(true);

  const releaseMic = useCallback(() => {
    clearTimeout(maxTimerRef.current);
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try { rec.onresult = null; rec.onend = null; rec.onerror = null; rec.stop(); } catch {}
    }
    onStateChange?.(false);
  }, [onStateChange]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch {} }
    releaseMic();
    const gapsFound = [];
    for (let i = 1; i < stampsRef.current.length; i++) {
      const gap = stampsRef.current[i] - stampsRef.current[i - 1];
      if (gap >= MIN_GAP && gap <= MAX_GAP) gapsFound.push(gap);
    }
    setGaps(gapsFound);
    const longest = gapsFound.length ? Math.max(...gapsFound) : 0;
    const recommended = longest > 0
      ? Math.round((longest + 250) / 50) * 50
      : Math.round(currentThreshold);
    setSuggested(Math.min(2500, Math.max(300, recommended)));
    setStatus('done');
  }, [currentThreshold, releaseMic]);

  const start = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Speech recognition is unavailable in this browser.');
      setStatus('error');
      return;
    }
    window.speechSynthesis?.cancel();
    setError('');
    setHeard('');
    setGaps([]);
    setSuggested(null);
    stampsRef.current = [];
    finishedRef.current = false;

    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    rec.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      const spoken = text.trim();
      setHeard(spoken);
      stampsRef.current.push(Date.now());
      if (spoken.split(/\s+/).length >= TARGET_WORDS) finish();
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      finishedRef.current = true;
      releaseMic();
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone access was denied.'
        : 'Calibration failed — the microphone may be busy.');
      setStatus('error');
    };
    rec.onend = () => finish();

    recRef.current = rec;
    setStatus('listening');
    onStateChange?.(true);
    try {
      rec.start();
      maxTimerRef.current = setTimeout(finish, MAX_DURATION);
    } catch {
      finishedRef.current = true;
      releaseMic();
      setError('Calibration could not start — the microphone may be busy.');
      setStatus('error');
    }
  }, [finish, onStateChange, releaseMic]);

  const reset = useCallback(() => {
    finishedRef.current = true;
    releaseMic();
    setStatus('idle');
    setHeard('');
    setGaps([]);
    setSuggested(null);
    setError('');
  }, [releaseMic]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  // Release the microphone whenever the popup goes away
  useEffect(() => {
    if (!isOpen) return;
    return () => { finishedRef.current = true; releaseMic(); };
  }, [isOpen, releaseMic]);

  if (!isOpen) return null;

  const longest = gaps.length ? Math.max(...gaps) : 0;
  const label = { fontSize: '0.62rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '2px' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 8200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', fontFamily: 'Rajdhani, sans-serif' }}
      onClick={close}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 480, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: 'rgba(0,8,8,0.98)', border: '1px solid rgba(0,255,204,0.28)', borderRadius: 4, boxShadow: '0 0 60px rgba(0,255,204,0.15)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid rgba(0,255,204,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mic size={13} style={{ color: 'var(--neon-primary)' }} />
          <span style={{ flex: 1, fontSize: '0.78rem', letterSpacing: '3px', color: 'var(--neon-primary)', textTransform: 'uppercase' }}>PAUSE CALIBRATION</span>
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)' }}><X size={14} /></button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={label}>READ THIS ALOUD</div>
          <div style={{ padding: '12px 14px', border: '1px solid rgba(0,255,204,0.15)', background: 'rgba(0,255,204,0.04)', borderRadius: 3, fontSize: '0.92rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.88)' }}>
            {SENTENCE}
          </div>
          <div style={{ fontSize: '0.66rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '1px', lineHeight: 1.5 }}>
            Speak at your normal pace and let your natural pauses happen. Timing is read from speech-recognition events, so treat the result as an estimate rather than an exact acoustic measurement.
          </div>

          {status === 'listening' && (
            <div style={{ padding: '10px 12px', border: '1px solid rgba(0,255,204,0.25)', borderRadius: 3, background: 'rgba(0,255,204,0.05)' }}>
              <div className="pulse-neon" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neon-primary)', display: 'inline-block', marginRight: 8 }} />
              <span style={{ fontSize: '0.68rem', letterSpacing: '2px', color: 'var(--neon-primary)' }}>LISTENING — {stampsRef.current.length} EVENTS</span>
              <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', minHeight: 20 }}>{heard || '…'}</div>
            </div>
          )}

          {status === 'error' && (
            <div style={{ fontSize: '0.72rem', letterSpacing: '1px', color: '#ff5555', border: '1px solid rgba(255,85,85,0.35)', padding: '8px 10px', borderRadius: 3 }}>{error}</div>
          )}

          {status === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid rgba(0,255,204,0.28)', background: 'rgba(0,255,204,0.06)', borderRadius: 3 }}>
                <span style={{ ...label }}>RECOMMENDED PAUSE</span>
                <span style={{ fontSize: '1.35rem', color: 'var(--neon-primary)', letterSpacing: '2px', textShadow: '0 0 12px rgba(0,255,204,0.5)' }}>{suggested} ms</span>
              </div>
              <div style={{ fontSize: '0.66rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '1px' }}>
                LONGEST PAUSE: {longest || 0} ms · CURRENT SETTING: {Math.round(currentThreshold)} ms
              </div>
              <div style={{ fontSize: '0.64rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1px', lineHeight: 1.5 }}>
                {gaps.length > 0
                  ? `PAUSES DETECTED: ${gaps.slice(0, 8).map(g => `${g}ms`).join(' · ')}`
                  : 'No usable pause was detected — the current setting is suggested.'}
              </div>
              {heard && (
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>HEARD: {heard}</div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
            {status !== 'listening' && (
              <button className="neon-btn px-4 py-2 rounded text-xs tracking-widest flex items-center gap-2 flex-1 justify-center" onClick={start}>
                {status === 'done' ? <RotateCcw size={12} /> : <Mic size={12} />}
                {status === 'done' ? 'RUN AGAIN' : 'START CALIBRATION'}
              </button>
            )}
            {status === 'listening' && (
              <button className="neon-btn neon-btn-danger px-4 py-2 rounded text-xs tracking-widest flex items-center gap-2 flex-1 justify-center" onClick={finish}>
                <Square size={12} /> STOP &amp; MEASURE
              </button>
            )}
            {status === 'done' && (
              <button className="neon-btn px-4 py-2 rounded text-xs tracking-widest flex items-center gap-1 justify-center" onClick={() => onApply?.(suggested)}>
                <Check size={12} /> APPLY
              </button>
            )}
            <button className="neon-btn px-4 py-2 rounded text-xs tracking-widest" onClick={close}>CLOSE</button>
          </div>
        </div>
      </div>
    </div>
  );
}