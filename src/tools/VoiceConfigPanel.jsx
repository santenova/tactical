import React, { useState, useEffect, useCallback } from 'react';
import { Mic, X, Volume2, RefreshCw } from 'lucide-react';
import { useLocalStorage } from '../../hooks/useLocalStorage';

const PRESETS = [
  { id: 'tactical', label: 'TACTICAL', pitch: 0.9, rate: 0.9, volume: 1.0, langHint: 'en-GB', genderHint: 'Female' },
  { id: 'oracle', label: 'ORACLE', pitch: 1.2, rate: 0.7, volume: 0.9, langHint: 'en-US', genderHint: 'Female' },
  { id: 'sentinel', label: 'SENTINEL', pitch: 0.6, rate: 1.0, volume: 1.0, langHint: 'en-US', genderHint: 'Male' },
  { id: 'ghost', label: 'GHOST', pitch: 1.3, rate: 0.6, volume: 0.8, langHint: 'en-GB', genderHint: 'Female' },
  { id: 'nemesis', label: 'NEMESIS', pitch: 0.5, rate: 1.2, volume: 1.0, langHint: 'en-US', genderHint: 'Male' },
  { id: 'stealth', label: 'STEALTH', pitch: 1.0, rate: 0.8, volume: 0.75, langHint: 'en-US', genderHint: '' },
];

const LS_KEY = 'tactical_voice_config';

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { pitch: 1.0, rate: 0.9, volume: 1.0, voiceName: '', preset: 'tactical' }; }
  catch { return { pitch: 1.0, rate: 0.9, volume: 1.0, voiceName: '', preset: 'tactical' }; }
}

export default function VoiceConfigPanel({ isOpen, onClose, onConfigChange }) {
  const [voices, setVoices] = useState([]);
  const [config, setConfig] = useState(loadConfig);
  const [preview, setPreview] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() || [];
      if (v.length) setVoices(v);
    };
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const saveConfig = useCallback((next) => {
    setConfig(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    onConfigChange?.(next);
  }, [onConfigChange]);

  const applyPreset = (preset) => {
    const p = PRESETS.find(x => x.id === preset.id);
    if (!p) return;
    const matchedVoice = voices.find(v =>
      v.lang.startsWith(p.langHint) &&
      (p.genderHint === '' || v.name.toLowerCase().includes(p.genderHint.toLowerCase()))
    ) || voices.find(v => v.lang.startsWith(p.langHint)) || null;
    saveConfig({ pitch: p.pitch, rate: p.rate, volume: p.volume, voiceName: matchedVoice?.name || '', preset: p.id });
  };

  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    setPreview(true);
    const utter = new SpeechSynthesisUtterance('Voice configuration active. Tactical system standing by.');
    const voice = voices.find(v => v.name === config.voiceName) || null;
    if (voice) utter.voice = voice;
    utter.pitch = config.pitch;
    utter.rate = config.rate;
    utter.volume = config.volume;
    utter.onend = () => setPreview(false);
    synth.speak(utter);
  };

  const filteredVoices = filter
    ? voices.filter(v => v.name.toLowerCase().includes(filter.toLowerCase()) || v.lang.toLowerCase().includes(filter.toLowerCase()))
    : voices;

  const slider = (label, key, min, max, step, fmt) => (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between" style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '2px' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--neon-primary)' }}>{fmt ? fmt(config[key]) : config[key]}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={config[key]}
        onChange={e => saveConfig({ ...config, [key]: parseFloat(e.target.value) })}
        style={{ cursor: 'pointer' }}
      />
    </div>
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 8100,
      width: 360, maxWidth: '95vw',
      background: 'rgba(0,6,6,0.97)',
      borderLeft: '1px solid rgba(0,255,204,0.18)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.8)',
      fontFamily: 'Rajdhani, sans-serif',
    }}>
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(0,255,204,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Mic size={13} style={{ color: 'var(--neon-primary)' }} />
        <span style={{ flex: 1, fontSize: '0.8rem', letterSpacing: '3px', color: 'var(--neon-primary)', textTransform: 'uppercase' }}>VOICE CONFIG</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)' }}><X size={14} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Presets */}
        <div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 8 }}>PERSONA PRESETS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => applyPreset(p)}
                style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.68rem', letterSpacing: '1px', padding: '6px 4px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${config.preset === p.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.15)'}`, color: config.preset === p.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)', background: config.preset === p.id ? 'rgba(0,255,204,0.08)' : 'transparent', textAlign: 'center' }}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: -4 }}>PARAMETERS</div>
          {slider('PITCH', 'pitch', 0.1, 2, 0.05, v => v.toFixed(2))}
          {slider('RATE', 'rate', 0.1, 2, 0.05, v => v.toFixed(2))}
          {slider('VOLUME', 'volume', 0, 1, 0.01, v => `${Math.round(v * 100)}%`)}
        </div>

        {/* Voice selector */}
        <div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 6 }}>VOICE ({voices.length})</div>
          <input type="text" placeholder="Filter voices..." value={filter} onChange={e => setFilter(e.target.value)}
            style={{ width: '100%', padding: '5px 10px', borderRadius: 3, fontSize: '0.75rem', marginBottom: 6 }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              onClick={() => saveConfig({ ...config, voiceName: '' })}
              style={{ textAlign: 'left', padding: '5px 10px', borderRadius: 3, border: `1px solid ${!config.voiceName ? 'var(--neon-primary)' : 'rgba(0,255,204,0.1)'}`, background: !config.voiceName ? 'rgba(0,255,204,0.07)' : 'transparent', color: !config.voiceName ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}
            >AUTO (browser default)</button>
            {filteredVoices.map(v => (
              <button key={v.name} onClick={() => saveConfig({ ...config, voiceName: v.name })}
                style={{ textAlign: 'left', padding: '5px 10px', borderRadius: 3, border: `1px solid ${config.voiceName === v.name ? 'var(--neon-primary)' : 'rgba(0,255,204,0.08)'}`, background: config.voiceName === v.name ? 'rgba(0,255,204,0.07)' : 'transparent', color: config.voiceName === v.name ? 'var(--neon-primary)' : 'rgba(0,255,204,0.5)', cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'Rajdhani, sans-serif' }}>
                <span>{v.name}</span>
                <span style={{ opacity: 0.4, marginLeft: 6, fontSize: '0.6rem' }}>{v.lang}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <button onClick={speak} disabled={preview} className="neon-btn px-4 py-2 rounded text-sm flex items-center justify-center gap-2">
          {preview ? <RefreshCw size={12} className="animate-spin" /> : <Volume2 size={12} />}
          {preview ? 'SPEAKING...' : '▶ PREVIEW VOICE'}
        </button>

        {/* Current config summary */}
        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,204,0.08)', borderRadius: 4, fontSize: '0.68rem', color: 'rgba(0,255,204,0.5)', lineHeight: 1.8 }}>
          <div><span style={{ opacity: 0.5 }}>PITCH:</span> {config.pitch.toFixed(2)}</div>
          <div><span style={{ opacity: 0.5 }}>RATE:</span> {config.rate.toFixed(2)}</div>
          <div><span style={{ opacity: 0.5 }}>VOLUME:</span> {Math.round(config.volume * 100)}%</div>
          <div><span style={{ opacity: 0.5 }}>VOICE:</span> {config.voiceName || 'auto'}</div>
        </div>
      </div>
    </div>
  );
}

export function loadVoiceConfig() { return loadConfig(); }