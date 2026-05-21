import React, { useState, useRef, useEffect } from 'react';
import { THEMES, applyTheme } from './ThemeSwitcher';

const TABS = [
  { id: 'ai',       label: '◈ AI' },
  { id: 'media',    label: '▶ MEDIA' },
  { id: 'recorder', label: '◉ REC' },
  { id: 'db',       label: '⬡ DB' },
  { id: 'browser',  label: '◻ BROWSER' },
  { id: 'core',     label: '◉ CORE' },
];

export default function Navbar({ activeTab, onTabChange, activeTheme, onThemeChange, onArchiveToggle, archiveCount = 0, onVoiceOpen, onMemoryOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = THEMES[activeTheme];

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: '1px solid rgba(0,255,204,0.12)',
        background: 'rgba(0,5,5,0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-4 px-4 h-10">
        <span
          className="text-xs tracking-[0.3em] font-bold flex-shrink-0"
          style={{ color: 'var(--neon-primary)', textShadow: '0 0 8px var(--neon-primary)' }}
        >
          TACTICAL
        </span>

        <div style={{ width: '1px', height: '16px', background: 'rgba(0,255,204,0.15)' }} />

        <div className="flex items-center gap-1">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.65rem',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  padding: '3px 10px',
                  borderRadius: '3px',
                  border: isActive ? '1px solid var(--neon-primary)' : '1px solid transparent',
                  color: isActive ? 'var(--neon-primary)' : 'rgba(255,255,255,0.35)',
                  background: isActive ? 'rgba(0,255,204,0.07)' : 'transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--neon-primary)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <button
          onClick={onMemoryOpen}
          title="Memory Inspector"
          style={{
            fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px', textTransform: 'uppercase',
            cursor: 'pointer', padding: '3px 10px', borderRadius: '3px',
            border: '1px solid rgba(0,255,204,0.2)', color: 'rgba(0,255,204,0.55)', background: 'transparent',
            display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--neon-primary)'; e.currentTarget.style.borderColor = 'var(--neon-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,255,204,0.55)'; e.currentTarget.style.borderColor = 'rgba(0,255,204,0.2)'; }}
        >⬡ MEM</button>

        <button
          onClick={onVoiceOpen}
          title="Voice Config"
          style={{
            fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px', textTransform: 'uppercase',
            cursor: 'pointer', padding: '3px 10px', borderRadius: '3px',
            border: '1px solid rgba(0,255,204,0.2)', color: 'rgba(0,255,204,0.55)', background: 'transparent',
            display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--neon-primary)'; e.currentTarget.style.borderColor = 'var(--neon-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,255,204,0.55)'; e.currentTarget.style.borderColor = 'rgba(0,255,204,0.2)'; }}
        >◎ VOICE</button>

        <button
          onClick={onArchiveToggle}
          title="Transcript Archive"
          style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '0.65rem',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: '3px 10px',
            borderRadius: '3px',
            border: '1px solid rgba(0,255,204,0.25)',
            color: 'rgba(0,255,204,0.6)',
            background: 'transparent',
            display: 'flex', alignItems: 'center', gap: '5px',
            transition: 'all 0.2s',
            position: 'relative',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--neon-primary)'; e.currentTarget.style.borderColor = 'var(--neon-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,255,204,0.6)'; e.currentTarget.style.borderColor = 'rgba(0,255,204,0.25)'; }}
        >
          ◷ ARCHIVE
          {archiveCount > 0 && (
            <span style={{ fontSize: '0.55rem', background: 'rgba(0,255,204,0.15)', border: '1px solid rgba(0,255,204,0.3)', borderRadius: '8px', padding: '0 5px', lineHeight: '16px', color: 'var(--neon-primary)' }}>
              {archiveCount}
            </span>
          )}
        </button>

        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.65rem',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: '3px 10px',
              borderRadius: '3px',
              border: `1px solid ${current.vars['--neon-primary']}`,
              color: current.vars['--neon-primary'],
              background: 'transparent',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <span>{current.icon}</span>
            <span>{current.label}</span>
            <span style={{ opacity: 0.5, fontSize: '0.55rem' }}>▾</span>
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              background: 'rgba(0,5,5,0.95)',
              border: '1px solid rgba(0,255,204,0.15)',
              borderRadius: '4px',
              overflow: 'hidden',
              minWidth: '130px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 9999,
            }}>
              {Object.entries(THEMES).map(([key, theme]) => {
                const isActive = activeTheme === key;
                return (
                  <button
                    key={key}
                    onClick={() => { onThemeChange(key); setOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      width: '100%', padding: '6px 12px',
                      fontFamily: 'Rajdhani, sans-serif',
                      fontSize: '0.65rem', letterSpacing: '2px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      border: 'none',
                      color: isActive ? theme.vars['--neon-primary'] : 'rgba(255,255,255,0.45)',
                      background: isActive ? `${theme.vars['--neon-primary']}11` : 'transparent',
                      borderLeft: isActive ? `2px solid ${theme.vars['--neon-primary']}` : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = theme.vars['--neon-primary']; e.currentTarget.style.background = `${theme.vars['--neon-primary']}11`; }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'transparent'; } }}
                  >
                    <span>{theme.icon}</span>
                    <span>{theme.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}