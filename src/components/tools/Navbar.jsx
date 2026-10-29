import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { THEMES } from './ThemeSwitcher';

const TABS = [
  { id: 'ai',       label: '◈ AI' },
  { id: 'media',    label: '▶ MEDIA' },
  { id: 'recorder', label: '◉ REC' },
  { id: 'db',       label: '⬡ DB' },
  { id: 'browser',  label: '◻ BROWSER' },
  { id: 'core',     label: '◉ CORE' },
];

export default function Navbar({ activeTab, onTabChange, activeTheme, onThemeChange, onArchiveToggle, archiveCount = 0, onVoiceOpen, onMemoryOpen }) {
  const [themeOpen, setThemeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const themeRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = THEMES[activeTheme] || Object.values(THEMES)[0];

  const tabBtn = (isActive) => ({
    fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px',
    textTransform: 'uppercase', cursor: 'pointer', padding: '4px 10px', borderRadius: 3,
    whiteSpace: 'nowrap', flexShrink: 0,
    border: isActive ? '1px solid var(--neon-primary)' : '1px solid transparent',
    color: isActive ? 'var(--neon-primary)' : 'rgba(255,255,255,0.35)',
    background: isActive ? 'rgba(0,255,204,0.07)' : 'transparent',
    transition: 'all 0.2s',
  });

  const utilBtn = {
    fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px',
    textTransform: 'uppercase', cursor: 'pointer', padding: '5px 12px', borderRadius: 3,
    border: '1px solid rgba(0,255,204,0.2)', color: 'rgba(0,255,204,0.6)', background: 'transparent',
    textDecoration: 'none', display: 'inline-block',
  };

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 1000, borderBottom: '1px solid rgba(0,255,204,0.12)', background: 'rgba(0,5,5,0.93)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>

      {/* ── Main bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 44 }}>

        {/* Brand */}
        <span style={{ color: 'var(--neon-primary)', textShadow: '0 0 8px var(--neon-primary)', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.8rem', letterSpacing: '0.3em', fontWeight: 700, flexShrink: 0 }}>
          TACTICAL
        </span>

        {/* Tabs — horizontally scrollable, no visible scrollbar */}
        <div style={{ flex: 1, display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => onTabChange(tab.id)} style={tabBtn(activeTab === tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Hamburger (utility drawer toggle) */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{ background: 'none', border: '1px solid rgba(0,255,204,0.2)', borderRadius: 3, cursor: 'pointer', color: 'var(--neon-primary)', padding: '5px 7px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          aria-label="Utility menu"
        >
          {menuOpen ? <X size={13} /> : <Menu size={13} />}
        </button>

        {/* Theme picker — always visible */}
        <div ref={themeRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setThemeOpen(o => !o)}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', cursor: 'pointer', padding: '4px 8px', borderRadius: 3, border: `1px solid ${current.vars['--neon-primary']}`, color: current.vars['--neon-primary'], background: 'transparent', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>{current.icon}</span>
            <span style={{ opacity: 0.5, fontSize: '0.55rem' }}>▾</span>
          </button>
          {themeOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'rgba(0,5,5,0.97)', border: '1px solid rgba(0,255,204,0.15)', borderRadius: 4, overflow: 'hidden', minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.7)', zIndex: 9999 }}>
              {Object.entries(THEMES).map(([key, theme]) => {
                const isActive = activeTheme === key;
                return (
                  <button key={key} onClick={() => { onThemeChange(key); setThemeOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '2px', textTransform: 'uppercase', cursor: 'pointer', border: 'none', color: isActive ? theme.vars['--neon-primary'] : 'rgba(255,255,255,0.45)', background: isActive ? `${theme.vars['--neon-primary']}11` : 'transparent', borderLeft: isActive ? `2px solid ${theme.vars['--neon-primary']}` : '2px solid transparent', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = theme.vars['--neon-primary']; e.currentTarget.style.background = `${theme.vars['--neon-primary']}11`; }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'transparent'; } }}
                  >
                    <span>{theme.icon}</span><span>{theme.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Utility drawer (hamburger) ── */}
      {menuOpen && (
        <div style={{ borderTop: '1px solid rgba(0,255,204,0.1)', background: 'rgba(0,3,3,0.97)', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button style={utilBtn} onClick={() => { onMemoryOpen(); setMenuOpen(false); }}>⬡ MEM</button>
          <button style={utilBtn} onClick={() => { onVoiceOpen(); setMenuOpen(false); }}>◎ VOICE</button>
          <button style={utilBtn} onClick={() => { onArchiveToggle(); setMenuOpen(false); }}>
            ◷ ARCHIVE{archiveCount > 0 && ` (${archiveCount})`}
          </button>
          <Link to="/interaction-logs" style={utilBtn} onClick={() => setMenuOpen(false)}>◈ LOGS</Link>
          <Link to="/knowledge-presets" style={utilBtn} onClick={() => setMenuOpen(false)}>⬡ PRESETS</Link>
          <Link to="/data-export" style={utilBtn} onClick={() => setMenuOpen(false)}>⇩ EXPORT</Link>
        </div>
      )}
    </nav>
  );
}