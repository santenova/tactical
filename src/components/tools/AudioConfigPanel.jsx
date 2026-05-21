import React, { useState, useRef, useEffect } from 'react';
import { DEFAULT_ORB_SETTINGS } from '../../pages/Home';

const STATE_LABELS = { 0: 'IDLE', 1: 'LISTENING', 2: 'THINKING', 3: 'SPEAKING', 4: 'CRISIS' };
const STATE_COLORS = { 0: 'rgba(0,255,204,0.3)', 1: 'var(--neon-primary)', 2: '#ffcc00', 3: '#00f3ff', 4: '#ff3333' };

const LANG_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish (ES)' },
  { value: 'fr-FR', label: 'French (FR)' },
  { value: 'de-DE', label: 'German (DE)' },
  { value: 'it-IT', label: 'Italian (IT)' },
  { value: 'pt-BR', label: 'Portuguese (BR)' },
  { value: 'ja-JP', label: 'Japanese (JP)' },
  { value: 'zh-CN', label: 'Chinese (CN)' },
  { value: 'ko-KR', label: 'Korean (KR)' },
  { value: 'ru-RU', label: 'Russian (RU)' },
  { value: 'ar-SA', label: 'Arabic (SA)' },
];

const SECTIONS = ['AUDIO', 'VOICE', 'ORB'];

export default function AudioConfigPanel({
  audioNodes, voiceEnabled, onVoiceToggle,
  orbMode = 0, orbSettings, onOrbSettingChange,
}) {
  const [activeSection, setActiveSection] = useState('AUDIO');
  const [bass, setBass] = useState(0);
  const [treble, setTreble] = useState(0);
  const [comp, setComp] = useState(-24);
  const [pan, setPan] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Initializing...');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const s = { ...DEFAULT_ORB_SETTINGS, ...orbSettings };

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) { setVoiceStatus('OFFLINE'); return; }
    const loadVoice = () => {
      const voices = synth.getVoices();
      const v =
        voices.find(v => v.name === 'Google UK English Female') ||
        voices.find(v => v.lang === 'en-GB' && v.name.includes('Female')) ||
        voices.find(v => v.lang === 'en-GB') ||
        voices[0];
      if (v) setVoiceStatus(v.name.length > 22 ? v.name.slice(0, 22) + '…' : v.name);
      else setVoiceStatus('DEFAULT VOICE');
    };
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoice;
    loadVoice();
  }, []);

  const applyAudio = (node, value) => {
    if (!audioNodes) return;
    if (node === 'bass') { audioNodes.bass.gain.value = value; setBass(value); }
    if (node === 'treble') { audioNodes.treble.gain.value = value; setTreble(value); }
    if (node === 'comp') { audioNodes.compressor.threshold.value = value; setComp(value); }
    if (node === 'pan' && audioNodes.panner?.pan) { audioNodes.panner.pan.value = value; setPan(value); }
  };

  const toggleRecord = async () => {
    if (isRecording) { recorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `stream-${Date.now()}.webm`; a.click();
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch { alert('Microphone access denied'); }
  };

  const fmt = (v, suffix = 'dB') => `${v > 0 ? '+' : ''}${v}${suffix}`;
  const neonColor = STATE_COLORS[orbMode] || STATE_COLORS[0];

  const set = onOrbSettingChange || (() => {});

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3 h-full">
      {/* Orb Status */}
      <div className="flex items-center justify-between pb-2" style={{ borderBottom: '1px solid rgba(0,255,204,0.1)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: neonColor, boxShadow: `0 0 6px ${neonColor}`, transition: 'all 0.3s' }} />
          <span className="text-xs tracking-widest" style={{ color: neonColor, transition: 'color 0.3s' }}>
            ORB: {STATE_LABELS[orbMode] || 'IDLE'}
          </span>
        </div>
        <span className="text-xs tracking-widest uppercase" style={{ color: 'rgba(0,255,204,0.3)' }}>TACTICAL SYS</span>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1">
        {SECTIONS.map(sec => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec)}
            className="flex-1 py-1 rounded text-xs tracking-widest uppercase transition-all"
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              background: activeSection === sec ? 'rgba(0,255,204,0.12)' : 'transparent',
              border: `1px solid ${activeSection === sec ? 'rgba(0,255,204,0.4)' : 'rgba(0,255,204,0.1)'}`,
              color: activeSection === sec ? 'var(--neon-primary)' : 'rgba(0,255,204,0.35)',
              cursor: 'pointer',
            }}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* ── AUDIO SECTION ── */}
      {activeSection === 'AUDIO' && (
        <div className="flex flex-col gap-3 flex-1">
          {[
            { label: 'BASS', key: 'bass', val: bass, min: -10, max: 30, set: v => { applyAudio('bass', v); if (!audioNodes) setBass(v); } },
            { label: 'TREBLE', key: 'treble', val: treble, min: -10, max: 30, set: v => { applyAudio('treble', v); if (!audioNodes) setTreble(v); } },
            { label: 'COMPRESSION', key: 'comp', val: comp, min: -100, max: 0, set: v => { applyAudio('comp', v); if (!audioNodes) setComp(v); } },
            { label: 'SPATIAL WIDTH', key: 'pan', val: pan, min: -1, max: 1, step: 0.1, fmt: v => `${v}`, set: v => { applyAudio('pan', v); if (!audioNodes) setPan(v); } },
          ].map(({ label, key, val, min, max, step = 1, fmt: fmtFn = fmt, set: setter }) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs tracking-wider" style={{ color: 'rgba(0,255,204,0.6)' }}>
                <span>{label}</span>
                <span className="neon-text">{fmtFn(val)}</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => setter(parseFloat(e.target.value))}
                data-desc={`Adjust ${label}`}
              />
            </div>
          ))}

          <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <button className={`neon-btn w-full py-2 rounded text-xs tracking-widest ${isRecording ? 'neon-btn-danger pulse-neon' : ''}`}
              onClick={toggleRecord} data-desc="Record Output Stream">
              {isRecording ? '■ STOP REC' : '● REC STREAM'}
            </button>
          </div>
        </div>
      )}

      {/* ── VOICE SECTION ── */}
      {activeSection === 'VOICE' && (
        <div className="flex flex-col gap-3 flex-1">
          {/* Voice on/off */}
          <div className="flex items-center justify-between">
            <span className="text-xs tracking-widest uppercase" style={{ color: 'rgba(0,255,204,0.6)' }}>VOICE OUTPUT</span>
            <button
              className={`neon-btn px-3 py-1 rounded text-xs tracking-widest flex items-center gap-1 ${voiceEnabled ? '' : 'neon-btn-danger'}`}
              onClick={onVoiceToggle}
              data-desc={voiceEnabled ? 'Disable Voice Output' : 'Enable Voice Output'}
            >
              <span style={{ fontSize: '0.65rem' }}>{voiceEnabled ? '🔊' : '🔇'}</span>
              {voiceEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Listening on/off */}
          {onOrbSettingChange && (
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest uppercase" style={{ color: 'rgba(0,255,204,0.6)' }}>ORB LISTENING</span>
              <button
                className={`neon-btn px-3 py-1 rounded text-xs tracking-widest flex items-center gap-1 ${s.listeningEnabled ? '' : 'neon-btn-danger'}`}
                onClick={() => set('listeningEnabled', !s.listeningEnabled)}
                data-desc={s.listeningEnabled ? 'Disable Microphone Listening' : 'Enable Microphone Listening'}
              >
                <span style={{ fontSize: '0.65rem' }}>{s.listeningEnabled ? '🎙️' : '🔕'}</span>
                {s.listeningEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          )}

          {/* Language */}
          {onOrbSettingChange && (
            <div className="flex flex-col gap-1">
              <span className="text-xs tracking-widest uppercase" style={{ color: 'rgba(0,255,204,0.6)' }}>RECOGNITION LANGUAGE</span>
              <select
                className="w-full px-2 py-1 rounded text-xs"
                value={s.recognitionLang}
                onChange={e => set('recognitionLang', e.target.value)}
                data-desc="Speech Recognition Language"
              >
                {LANG_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          )}

          {/* Speech Rate */}
          {onOrbSettingChange && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs tracking-wider" style={{ color: 'rgba(0,255,204,0.6)' }}>
                <span>SPEECH RATE</span>
                <span className="neon-text">{s.speechRate.toFixed(2)}x</span>
              </div>
              <input type="range" min={0.5} max={2.0} step={0.05} value={s.speechRate}
                onChange={e => set('speechRate', parseFloat(e.target.value))}
                data-desc="Adjust Speech Rate" />
            </div>
          )}

          {/* Speech Pitch */}
          {onOrbSettingChange && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs tracking-wider" style={{ color: 'rgba(0,255,204,0.6)' }}>
                <span>SPEECH PITCH</span>
                <span className="neon-text">{s.speechPitch.toFixed(2)}</span>
              </div>
              <input type="range" min={0.5} max={2.0} step={0.05} value={s.speechPitch}
                onChange={e => set('speechPitch', parseFloat(e.target.value))}
                data-desc="Adjust Speech Pitch" />
            </div>
          )}

          {/* Voice module info */}
          <div className="mt-auto pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <p className="text-xs opacity-60 uppercase tracking-widest mb-1">VOICE MODULE</p>
            <div className="text-xs neon-text truncate">{voiceStatus}</div>
          </div>
        </div>
      )}

      {/* ── ORB SECTION ── */}
      {activeSection === 'ORB' && onOrbSettingChange && (
        <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
          {[
            { label: 'FILAMENT COUNT', key: 'filamentCount', min: 60, max: 360, step: 10, fmt: v => `${v}` },
            { label: 'ANIM SPEED', key: 'animSpeed', min: 0.01, max: 0.15, step: 0.01, fmt: v => v.toFixed(2) },
            { label: 'SPEAKING VOLATILITY', key: 'speakingVolatility', min: 0.5, max: 10, step: 0.5, fmt: v => v.toFixed(1) },
            { label: 'LISTENING VOLATILITY', key: 'listeningVolatility', min: 0.5, max: 6, step: 0.5, fmt: v => v.toFixed(1) },
            { label: 'THINKING VOLATILITY', key: 'thinkingVolatility', min: 0.1, max: 3, step: 0.1, fmt: v => v.toFixed(1) },
            { label: 'CRISIS VOLATILITY', key: 'crisisVolatility', min: 1, max: 20, step: 1, fmt: v => `${v}` },
            { label: 'SPEAKING SURGE', key: 'speakingSurge', min: 0, max: 40, step: 1, fmt: v => `${v}` },
            { label: 'LISTENING SURGE', key: 'listeningSurge', min: 0, max: 30, step: 1, fmt: v => `${v}` },
            { label: 'THINKING SURGE', key: 'thinkingSurge', min: -20, max: 0, step: 1, fmt: v => `${v}` },
          ].map(({ label, key, min, max, step, fmt: fmtFn }) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs tracking-wider" style={{ color: 'rgba(0,255,204,0.6)' }}>
                <span>{label}</span>
                <span className="neon-text">{fmtFn(s[key] ?? DEFAULT_ORB_SETTINGS[key])}</span>
              </div>
              <input type="range" min={min} max={max} step={step}
                value={s[key] ?? DEFAULT_ORB_SETTINGS[key]}
                onChange={e => set(key, parseFloat(e.target.value))}
                data-desc={`Adjust ${label}`}
              />
            </div>
          ))}

          <button
            className="neon-btn py-1 rounded text-xs tracking-widest mt-1"
            onClick={() => {
              const defaults = DEFAULT_ORB_SETTINGS;
              ['filamentCount','animSpeed','speakingVolatility','listeningVolatility','thinkingVolatility','crisisVolatility','speakingSurge','listeningSurge','thinkingSurge'].forEach(k => set(k, defaults[k]));
            }}
            data-desc="Reset Orb Parameters to Default"
          >
            ↺ RESET ORB DEFAULTS
          </button>
        </div>
      )}

      {activeSection === 'ORB' && !onOrbSettingChange && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs opacity-30 tracking-widest uppercase text-center">Orb config available<br />in AI tab only</p>
        </div>
      )}
    </div>
  );
}