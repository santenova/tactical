import React, { useRef, useState, useMemo } from 'react';
import { ArrowUpDown, Clock, HardDrive, Calendar } from 'lucide-react';

const SORT_OPTIONS = [
  { key: 'importedAt', label: 'DATE', icon: Calendar },
  { key: 'duration',   label: 'DURATION', icon: Clock },
  { key: 'size',       label: 'SIZE', icon: HardDrive },
  { key: 'name',       label: 'NAME', icon: ArrowUpDown },
];

function fmtDuration(s) {
  if (!s || s === 0) return '—';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtBitrate(kbps) {
  if (!kbps) return '—';
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${kbps} kbps`;
}

function fmtRes(w, h) {
  if (!w || !h) return '—';
  if (w >= 3840) return '4K';
  if (w >= 1920) return '1080p';
  if (w >= 1280) return '720p';
  if (w >= 854)  return '480p';
  return `${w}×${h}`;
}

export default function MediaRepository({ playlist, currentIndex, onImport, onSelect, errorMsg }) {
  const fileInputRef = useRef(null);
  const [sortKey, setSortKey] = useState('importedAt');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = useMemo(() => {
    const indexed = playlist.map((t, i) => ({ ...t, _origIdx: i }));
    return indexed.sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
  }, [playlist, sortKey, sortAsc]);

  return (
    <div className="tactical-panel rounded p-3 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between pb-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <h3 className="text-xs tracking-widest uppercase m-0" style={{ color: 'var(--neon-primary)' }}>
          MEDIA REPOSITORY
        </h3>
        <span className="text-xs opacity-30">{playlist.length} files</span>
      </div>

      <input ref={fileInputRef} type="file" accept="video/*,audio/*" multiple style={{ display: 'none' }} onChange={onImport} />

      <button
        className="neon-btn w-full py-2 rounded text-xs font-bold tracking-widest flex-shrink-0"
        onClick={() => fileInputRef.current?.click()}
        data-desc="Open System File Dialog"
        style={{ clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)' }}
      >
        + IMPORT FILES
      </button>

      {/* Sort controls */}
      <div className="flex gap-1 flex-shrink-0">
        {SORT_OPTIONS.map(({ key, label }) => {
          const active = sortKey === key;
          return (
            <button key={key} onClick={() => toggleSort(key)}
              className="flex-1 py-1 rounded text-center transition-all"
              style={{
                fontFamily: 'Rajdhani, sans-serif', fontSize: '0.55rem', letterSpacing: '1px',
                textTransform: 'uppercase', cursor: 'pointer',
                background: active ? 'rgba(0,255,204,0.1)' : 'transparent',
                border: `1px solid ${active ? 'rgba(0,255,204,0.35)' : 'rgba(0,255,204,0.08)'}`,
                color: active ? 'var(--neon-primary)' : 'rgba(0,255,204,0.3)',
              }}
              data-desc={`Sort by ${label}`}
            >
              {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto flex flex-col" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {sorted.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-xs opacity-20 tracking-wider uppercase text-center p-4">
            No files imported.<br />Click IMPORT FILES to begin.
          </div>
        )}
        {sorted.map((track) => {
          const isActive = track._origIdx === currentIndex;
          const isVideo = track.type?.startsWith('video/');
          return (
            <div
              key={track.url || track._origIdx}
              onClick={() => onSelect(track._origIdx)}
              style={{
                padding: '8px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                borderLeft: `3px solid ${isActive ? 'var(--neon-primary)' : 'transparent'}`,
                background: isActive ? 'rgba(0,255,204,0.05)' : 'transparent',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,255,204,0.04)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Name row */}
              <div className="flex items-center gap-1 mb-1">
                <span style={{ fontSize: '0.65rem', opacity: 0.4, flexShrink: 0 }}>{isVideo ? '▶' : '♪'}</span>
                <span
                  className="flex-1 truncate text-xs"
                  style={{ color: isActive ? 'var(--neon-primary)' : 'rgba(255,255,255,0.75)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.5px' }}
                  title={track.name}
                >
                  {track.name}
                </span>
              </div>

              {/* Metadata badges */}
              <div className="flex gap-1 flex-wrap">
                {[
                  track.duration  && { label: fmtDuration(track.duration), title: 'Duration' },
                  track.size      && { label: fmtSize(track.size), title: 'File size' },
                  track.bitrate   && { label: fmtBitrate(track.bitrate), title: 'Bitrate' },
                  isVideo && track.width && { label: fmtRes(track.width, track.height), title: 'Resolution' },
                ].filter(Boolean).map((badge, bi) => (
                  <span key={bi} title={badge.title}
                    style={{
                      fontSize: '0.6rem', padding: '1px 5px', borderRadius: '2px',
                      background: isActive ? 'rgba(0,255,204,0.12)' : 'rgba(0,255,204,0.05)',
                      color: isActive ? 'rgba(0,255,204,0.8)' : 'rgba(0,255,204,0.35)',
                      border: '1px solid rgba(0,255,204,0.08)',
                      fontFamily: 'monospace',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {badge.label}
                  </span>
                ))}
                {!track.size && (
                  <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.2)', fontFamily: 'monospace' }}>no metadata</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 text-center" style={{ fontSize: '0.65rem', color: errorMsg ? 'var(--neon-alert)' : '#555', letterSpacing: '1px', paddingTop: '4px' }}>
        {errorMsg || 'TACTICAL OS v4.0 · SECURE CONNECTION'}
      </div>
    </div>
  );
}