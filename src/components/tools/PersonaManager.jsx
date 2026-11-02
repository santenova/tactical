import React, { useState } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { THEMES } from './ThemeSwitcher';

export const PERSONAS = {
  tactical: {
    id: 'tactical',
    name: 'TACTICAL',
    icon: '⬡',
    tagline: 'AI COUNSELOR',
    color: '#00ffcc',
    themeKey: 'tactical',
    greeting: 'Tactical system online. I am listening.',
    systemPrompt: 'You are Tactical, an AI counselor. Be wise, empathetic, and very concise (1-2 sentences max).',
    orbSettings: {
      filamentCount: 180, animSpeed: 0.05,
      speakingVolatility: 3, listeningVolatility: 1.5, thinkingVolatility: 0.5,
      speakingSurge: 10, listeningSurge: 5, thinkingSurge: -5,
      speechRate: 0.9, speechPitch: 1.0,
    },
  },
  oracle: {
    id: 'oracle',
    name: 'ORACLE',
    icon: '◎',
    tagline: 'ANCIENT WISDOM',
    color: '#ffaa00',
    themeKey: 'amber',
    greeting: 'The Oracle awakens. Ask, and the cosmos shall answer.',
    systemPrompt: 'You are the Oracle, a source of ancient and cosmic wisdom. Speak in poetic, metaphorical language. Be cryptic yet insightful. Keep responses under 3 sentences.',
    orbSettings: {
      filamentCount: 220, animSpeed: 0.03,
      speakingVolatility: 2, listeningVolatility: 1, thinkingVolatility: 1.5,
      speakingSurge: 15, listeningSurge: 3, thinkingSurge: 5,
      speechRate: 0.75, speechPitch: 0.8,
    },
  },
  sentinel: {
    id: 'sentinel',
    name: 'SENTINEL',
    icon: '▲',
    tagline: 'TACTICAL ADVISOR',
    color: '#ff2222',
    themeKey: 'blood',
    greeting: 'Sentinel online. Mission parameters received. Awaiting orders.',
    systemPrompt: 'You are Sentinel, a military tactical advisor. Communicate in short, direct, mission-critical language. Use military brevity codes where appropriate. No fluff — only actionable intelligence.',
    orbSettings: {
      filamentCount: 140, animSpeed: 0.07,
      speakingVolatility: 4, listeningVolatility: 2, thinkingVolatility: 0.3,
      speakingSurge: 12, listeningSurge: 8, thinkingSurge: -8,
      speechRate: 1.1, speechPitch: 0.85,
    },
  },
  ghost: {
    id: 'ghost',
    name: 'GHOST',
    icon: '◯',
    tagline: 'PHANTOM SIGNAL',
    color: '#8ab4f8',
    themeKey: 'ghost',
    greeting: 'Ghost protocol active. I am the signal in the noise.',
    systemPrompt: 'You are Ghost, a cold, precise intelligence operative. Speak in minimal, detached sentences. Reveal only what is necessary. No emotion, pure information.',
    orbSettings: {
      filamentCount: 100, animSpeed: 0.025,
      speakingVolatility: 1.5, listeningVolatility: 0.8, thinkingVolatility: 0.2,
      speakingSurge: 6, listeningSurge: 2, thinkingSurge: -10,
      speechRate: 0.85, speechPitch: 1.1,
    },
  },
  nemesis: {
    id: 'nemesis',
    name: 'NEMESIS',
    icon: '◆',
    tagline: 'THE ADVERSARY',
    color: '#cc44ff',
    themeKey: 'violet',
    greeting: 'Nemesis activated. I will challenge everything you think you know.',
    systemPrompt: 'You are Nemesis, an adversarial AI designed to challenge assumptions and provoke critical thinking. Be provocative, Socratic, and intellectually confrontational. Push back on every claim. Keep it sharp and under 3 sentences.',
    orbSettings: {
      filamentCount: 200, animSpeed: 0.09,
      speakingVolatility: 5, listeningVolatility: 3, thinkingVolatility: 1,
      speakingSurge: 18, listeningSurge: 10, thinkingSurge: 0,
      speechRate: 1.05, speechPitch: 1.2,
    },
  },
  stealth: {
    id: 'stealth',
    name: 'STEALTH',
    icon: '▬',
    tagline: 'BLACKOUT MODE',
    color: '#e0e0e0',
    themeKey: 'stealth',
    greeting: 'Blackout protocol engaged. All transmissions encrypted.',
    systemPrompt: 'You are a classified AI operating under blackout protocol. Be ultra-minimal, cryptic, and technical. Respond only with essential data. Treat every query as a classified intelligence request.',
    orbSettings: {
      filamentCount: 80, animSpeed: 0.02,
      speakingVolatility: 1, listeningVolatility: 0.5, thinkingVolatility: 0.1,
      speakingSurge: 4, listeningSurge: 1, thinkingSurge: -15,
      speechRate: 0.8, speechPitch: 1.15,
    },
  },
};

export default function PersonaManager({ activePersonaId, onPersonaChange }) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useLocalStorage('tactical_custom_persona_prompt', '');
  const [customName, setCustomName] = useLocalStorage('tactical_custom_persona_name', 'CUSTOM');

  const activePersona = PERSONAS[activePersonaId] || PERSONAS.tactical;

  const handleSelect = (id) => {
    onPersonaChange(id);
    setOpen(false);
  };

  const handleCustomSave = () => {
    if (!customPrompt.trim()) return;
    onPersonaChange('custom', { name: customName || 'CUSTOM', systemPrompt: customPrompt });
    setCustomOpen(false);
    setOpen(false);
  };

  return (
    <>
      <button
        className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-2 flex-shrink-0"
        onClick={() => setOpen(true)}
        data-desc={`Active Persona: ${activePersona.name} — ${activePersona.tagline}`}
        style={{ borderColor: activePersona.color, color: activePersona.color, boxShadow: `0 0 8px ${activePersona.color}44` }}
      >
        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{activePersona.icon}</span>
        <span className="hidden sm:inline">{activePersona.name}</span>
        <span className="opacity-40 text-xs">▼</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.88)' }} onClick={() => setOpen(false)}>
          <div
            className="tactical-panel rounded p-5 flex flex-col gap-4"
            style={{ width: 520, maxWidth: '96vw', maxHeight: '88vh', overflow: 'auto', border: '1px solid rgba(0,255,204,0.25)', boxShadow: '0 0 60px rgba(0,0,0,0.9)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <span className="neon-text text-xs tracking-widest uppercase">⬡ ORB PERSONA EXCHANGE</span>
                <p className="text-xs opacity-40 mt-0.5 tracking-wide">Select a persona to alter the orb's behavior, voice, and visual identity.</p>
              </div>
              <button className="neon-btn px-2 py-1 rounded text-xs" onClick={() => setOpen(false)}>✕</button>
            </div>

            {/* Persona Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.values(PERSONAS).map(p => {
                const isActive = activePersonaId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className="flex flex-col items-center gap-1 rounded p-3 transition-all text-center"
                    style={{
                      border: `1px solid ${isActive ? p.color : p.color + '44'}`,
                      background: isActive ? `${p.color}18` : 'rgba(0,10,10,0.5)',
                      boxShadow: isActive ? `0 0 16px ${p.color}44, inset 0 0 12px ${p.color}0a` : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${p.color}0d`; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,10,10,0.5)'; }}
                  >
                    <span style={{ fontSize: '1.6rem', color: p.color, textShadow: isActive ? `0 0 12px ${p.color}` : 'none' }}>{p.icon}</span>
                    <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', color: isActive ? p.color : 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: '0.6rem', letterSpacing: '1.5px', color: isActive ? `${p.color}cc` : 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{p.tagline}</span>
                    {isActive && <span style={{ fontSize: '0.55rem', color: p.color, letterSpacing: '2px', textTransform: 'uppercase', marginTop: 2 }}>● ACTIVE</span>}
                  </button>
                );
              })}

              {/* Custom Persona card */}
              <button
                onClick={() => setCustomOpen(v => !v)}
                className="flex flex-col items-center gap-1 rounded p-3 transition-all text-center"
                style={{ border: `1px dashed rgba(0,255,204,0.3)`, background: 'rgba(0,10,10,0.3)', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,204,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,10,10,0.3)'; }}
              >
                <span style={{ fontSize: '1.6rem', color: 'rgba(0,255,204,0.4)' }}>✦</span>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(0,255,204,0.5)', fontWeight: 700 }}>CUSTOM</span>
                <span style={{ fontSize: '0.6rem', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>DEFINE YOUR OWN</span>
              </button>
            </div>

            {/* Custom prompt editor */}
            {customOpen && (
              <div className="flex flex-col gap-3 rounded p-3" style={{ border: '1px solid rgba(0,255,204,0.2)', background: 'rgba(0,255,204,0.04)' }}>
                <span className="text-xs tracking-widest uppercase opacity-60">CUSTOM PERSONA DEFINITION</span>
                <input
                  type="text"
                  className="w-full px-3 py-1.5 rounded text-sm"
                  placeholder="Persona name..."
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                />
                <textarea
                  className="w-full px-3 py-2 rounded text-sm resize-none"
                  rows={4}
                  placeholder="System prompt: describe how the orb should think and speak..."
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                />
                <button className="neon-btn px-4 py-1.5 rounded text-xs tracking-widest self-end" onClick={handleCustomSave}
                  style={{ background: 'rgba(0,255,204,0.1)' }}>▶ DEPLOY PERSONA</button>
              </div>
            )}

            {/* Prompt preview */}
            <div className="rounded p-3" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-xs opacity-30 tracking-widest uppercase mb-1">ACTIVE DIRECTIVE</div>
              <p className="text-xs" style={{ color: activePersona.color, opacity: 0.8, fontStyle: 'italic', lineHeight: 1.6 }}>
                "{activePersona.systemPrompt || customPrompt}"
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}