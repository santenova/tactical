import React, { useState, useMemo } from 'react';
import { X, Archive, MessageSquare, User, Bot, ChevronRight, Trash2, RefreshCw } from 'lucide-react';

export default function TranscriptArchive({ log = [], onReEngage, onClear, isOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const stats = useMemo(() => ({
    totalChats: log.length,
    totalMessages: log.length * 2,
    userMessages: log.length,
    aiMessages: log.length,
  }), [log]);

  const filtered = useMemo(() => {
    if (!search.trim()) return log;
    const q = search.toLowerCase();
    return log.filter(e =>
      e.user.toLowerCase().includes(q) || e.ai.toLowerCase().includes(q)
    );
  }, [log, search]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 8000,
      width: 400, maxWidth: '92vw',
      background: 'rgba(0,8,8,0.97)',
      borderLeft: '1px solid rgba(0,255,204,0.18)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.7)',
      fontFamily: 'Rajdhani, sans-serif',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(0,255,204,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Archive size={14} style={{ color: 'var(--neon-primary)' }} />
        <span style={{ flex: 1, fontSize: '0.8rem', letterSpacing: '3px', color: 'var(--neon-primary)', textTransform: 'uppercase' }}>
          TRANSCRIPT ARCHIVE
        </span>
        <button onClick={onClear} title="Clear all" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,80,80,0.5)', padding: '2px 6px' }}>
          <Trash2 size={13} />
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)', padding: '2px 6px' }}>
          <X size={14} />
        </button>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(0,255,204,0.08)',
        gap: 8,
      }}>
        {[
          { label: 'CHATS', value: stats.totalChats, icon: <MessageSquare size={10} /> },
          { label: 'TOTAL MSG', value: stats.totalMessages, icon: <ChevronRight size={10} /> },
          { label: 'USER', value: stats.userMessages, icon: <User size={10} /> },
          { label: 'ORBI', value: stats.aiMessages, icon: <Bot size={10} /> },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: 'rgba(0,255,204,0.04)',
            border: '1px solid rgba(0,255,204,0.1)',
            borderRadius: 4, padding: '7px 6px', textAlign: 'center',
          }}>
            <div style={{ color: 'rgba(0,255,204,0.45)', fontSize: '0.55rem', letterSpacing: '1.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 3 }}>
              {icon}{label}
            </div>
            <div style={{ color: 'var(--neon-primary)', fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,255,204,0.08)' }}>
        <input
          type="text"
          placeholder="SEARCH ARCHIVE..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 4,
            fontSize: '0.8rem', letterSpacing: '1px',
          }}
        />
      </div>

      {/* Entry List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(0,255,204,0.2)', fontSize: '0.75rem', letterSpacing: '2px' }}>
            NO TRANSMISSIONS LOGGED
          </div>
        )}
        {[...filtered].reverse().map((entry, idx) => (
          <div
            key={entry.id}
            onClick={() => setSelected(selected?.id === entry.id ? null : entry)}
            style={{
              margin: '0 10px 6px',
              borderRadius: 4,
              border: `1px solid ${selected?.id === entry.id ? 'rgba(0,255,204,0.3)' : 'rgba(0,255,204,0.08)'}`,
              background: selected?.id === entry.id ? 'rgba(0,255,204,0.05)' : 'rgba(0,10,10,0.5)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1px' }}>
                  #{filtered.length - idx} · {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* User line */}
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
                <User size={10} style={{ color: 'rgba(0,255,204,0.5)', marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
                  {entry.user.length > 80 ? entry.user.slice(0, 80) + '…' : entry.user}
                </span>
              </div>

              {/* AI line */}
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <Bot size={10} style={{ color: 'var(--neon-primary)', marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', color: 'rgba(0,255,204,0.55)', lineHeight: 1.4 }}>
                  {entry.ai.length > 100 ? entry.ai.slice(0, 100) + '…' : entry.ai}
                </span>
              </div>

              {/* Expanded full view */}
              {selected?.id === entry.id && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,255,204,0.1)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 10 }}>
                    <span style={{ color: 'rgba(0,255,204,0.4)', letterSpacing: '1px', fontSize: '0.6rem' }}>FULL RESPONSE:</span>
                    <br />{entry.ai}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={e => { e.stopPropagation(); onReEngage(entry, 'summarize'); }}
                      className="neon-btn"
                      style={{ flex: 1, padding: '6px 8px', fontSize: '0.65rem', letterSpacing: '1.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <RefreshCw size={10} /> SUMMARIZE
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onReEngage(entry, 'elaborate'); }}
                      className="neon-btn"
                      style={{ flex: 1, padding: '6px 8px', fontSize: '0.65rem', letterSpacing: '1.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <ChevronRight size={10} /> ELABORATE
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}