import React, { useState } from 'react';

export const THEMES = {
  tactical: {
    label: 'TACTICAL', icon: '◈', tagline: 'GRID ONLINE',
    vars: { '--background': '0 0% 2%', '--foreground': '180 100% 90%', '--card': '180 10% 5%', '--border': '180 30% 15%', '--primary': '165 100% 50%', '--muted': '180 5% 12%', '--neon-primary': '#00ffcc', '--neon-secondary': '#00f3ff', '--neon-alert': '#ff3333', '--iris-primary': '#00ffcc' },
  },
  blood: {
    label: 'BLOOD', icon: '◆', tagline: 'TARGET ACQUIRED',
    vars: { '--background': '0 0% 2%', '--foreground': '0 100% 90%', '--card': '0 10% 5%', '--border': '0 30% 15%', '--primary': '0 100% 50%', '--muted': '0 5% 12%', '--neon-primary': '#ff2222', '--neon-secondary': '#ff6600', '--neon-alert': '#ffff00', '--iris-primary': '#ff2222' },
  },
  ghost: {
    label: 'GHOST', icon: '◯', tagline: 'SIGNAL PHANTOM',
    vars: { '--background': '220 15% 6%', '--foreground': '220 20% 92%', '--card': '220 12% 9%', '--border': '220 15% 18%', '--primary': '220 60% 70%', '--muted': '220 10% 14%', '--neon-primary': '#8ab4f8', '--neon-secondary': '#c9d1ff', '--neon-alert': '#ff6b6b', '--iris-primary': '#8ab4f8' },
  },
  amber: {
    label: 'AMBER', icon: '◉', tagline: 'HEAT SIGNATURE',
    vars: { '--background': '30 10% 3%', '--foreground': '40 100% 80%', '--card': '30 10% 6%', '--border': '40 30% 15%', '--primary': '40 100% 55%', '--muted': '30 8% 12%', '--neon-primary': '#ffaa00', '--neon-secondary': '#ffdd55', '--neon-alert': '#ff4444', '--iris-primary': '#ffaa00' },
  },
  matrix: {
    label: 'MATRIX', icon: '▣', tagline: 'ENTERING THE CODE',
    vars: { '--background': '120 20% 2%', '--foreground': '120 100% 75%', '--card': '120 15% 5%', '--border': '120 30% 12%', '--primary': '120 100% 40%', '--muted': '120 10% 10%', '--neon-primary': '#00cc44', '--neon-secondary': '#44ff88', '--neon-alert': '#ff3333', '--iris-primary': '#00cc44' },
  },
  violet: {
    label: 'VIOLET', icon: '◇', tagline: 'DEEP FREQUENCY',
    vars: { '--background': '270 15% 3%', '--foreground': '280 100% 90%', '--card': '270 12% 6%', '--border': '270 25% 15%', '--primary': '280 100% 65%', '--muted': '270 8% 11%', '--neon-primary': '#cc44ff', '--neon-secondary': '#ff88ff', '--neon-alert': '#ff4444', '--iris-primary': '#cc44ff' },
  },
  stealth: {
    label: 'STEALTH', icon: '▬', tagline: 'BLACKOUT PROTOCOL',
    vars: { '--background': '0 0% 0%', '--foreground': '0 0% 95%', '--card': '0 0% 5%', '--border': '0 0% 20%', '--primary': '0 0% 90%', '--muted': '0 0% 8%', '--neon-primary': '#e0e0e0', '--neon-secondary': '#ffffff', '--neon-alert': '#ff3333', '--iris-primary': '#e0e0e0' },
  },
  natural: {
    label: 'NATURAL', icon: '◍', tagline: 'CALM SIGNAL',
    vars: { '--background': '60 8% 97%', '--foreground': '80 15% 20%', '--card': '60 10% 93%', '--border': '80 12% 78%', '--primary': '150 35% 42%', '--muted': '60 8% 88%', '--neon-primary': '#4a8c6a', '--neon-secondary': '#6aad88', '--neon-alert': '#c0392b', '--iris-primary': '#4a8c6a' },
  },
};

export function applyTheme(themeKey) {
  const theme = THEMES[themeKey];
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });
}

export default function ThemeSwitcher({ activeTheme, onThemeChange }) {
  const [flash, setFlash] = useState(null);
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('tactical_accent_color') || '');

  const handleAccentColor = (color) => {
    setAccentColor(color);
    localStorage.setItem('tactical_accent_color', color);
    const root = document.documentElement;
    root.style.setProperty('--neon-primary', color);
    root.style.setProperty('--iris-primary', color);
    // derive a lighter secondary
    root.style.setProperty('--neon-secondary', color + 'cc');
  };

  const handleSwitch = (key) => {
    if (key === activeTheme) return;
    const theme = THEMES[key];
    setFlash({ color: theme.vars['--neon-primary'], tagline: theme.tagline, icon: theme.icon });
    onThemeChange(key);
    setTimeout(() => setFlash(null), 900);
  };

  return (
    <>
      {flash && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(ellipse at center, ${flash.color}22 0%, transparent 70%)`, animation: 'theme-flash 0.9s ease-out forwards', pointerEvents: 'none' }}>
          <div style={{ fontSize: '4rem', lineHeight: 1, color: flash.color, textShadow: `0 0 40px ${flash.color}`, animation: 'theme-flash-text 0.9s ease-out forwards' }}>{flash.icon}</div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', letterSpacing: '0.4em', color: flash.color, marginTop: '1rem', textTransform: 'uppercase' }}>{flash.tagline}</div>
        </div>
      )}
      <style>{`
        @keyframes theme-flash { 0% { opacity: 0; } 15% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes theme-flash-text { 0% { transform: scale(0.5); opacity: 0; } 20% { transform: scale(1.2); opacity: 1; } 60% { transform: scale(1.0); opacity: 1; } 100% { transform: scale(1.1); opacity: 0; } }
      `}</style>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs tracking-widest mr-2" style={{ color: 'rgba(128,128,128,0.5)' }}>THEME</span>
        {Object.entries(THEMES).map(([key, { label, icon, vars }]) => {
          const color = vars['--neon-primary'];
          const isActive = activeTheme === key;
          return (
            <button key={key} onClick={() => handleSwitch(key)} data-desc={`${label} — ${THEMES[key].tagline}`} title={label}
              style={{ fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.7rem', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 10px', borderRadius: '3px', border: `1px solid ${color}`, color: isActive ? '#000' : color, background: isActive ? color : 'transparent', boxShadow: isActive ? `0 0 12px ${color}` : `0 0 4px ${color}33`, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '0.85rem' }}>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
        {/* Accent color picker */}
        <div className="flex items-center gap-1 ml-1" title="Custom accent color" data-desc="Pick a custom neon accent color">
          <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.7rem', letterSpacing: '2px', color: 'rgba(128,128,128,0.5)', textTransform: 'uppercase' }}>ACCENT</span>
          <div style={{ position: 'relative', width: 28, height: 22, borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}>
            <input type="color" value={accentColor || THEMES[activeTheme]?.vars?.['--neon-primary'] || '#00ffcc'}
              onChange={e => handleAccentColor(e.target.value)}
              style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', cursor: 'pointer', opacity: 1, border: 'none', padding: 0 }}
            />
          </div>
        </div>
      </div>
    </>
  );
}