import React from 'react';
import { Sparkles, RefreshCw, X, ExternalLink } from 'lucide-react';

function renderWithCitations(text, sources) {
  if (!text) return null;
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    const src = m ? sources.find(s => s.n === Number(m[1])) : null;
    if (!src) return <React.Fragment key={i}>{part}</React.Fragment>;
    return (
      <a
        key={i}
        href={src.url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        title={src.title}
        style={{ display: 'inline-block', fontSize: '0.58rem', fontFamily: 'Rajdhani, sans-serif', color: '#bb88ff', border: '1px solid rgba(187,136,255,0.4)', borderRadius: 3, padding: '0 3px', margin: '0 1px', textDecoration: 'none', verticalAlign: 'super', lineHeight: 1 }}
      >
        {m[1]}
      </a>
    );
  });
}

export default function RagAnswer({ answer, sources, loading, error, onClose }) {
  if (!loading && !answer && !error) return null;

  return (
    <div style={{ background: 'rgba(187,136,255,0.05)', border: '1px solid rgba(187,136,255,0.22)', borderRadius: 5, padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="flex items-center gap-2">
        <Sparkles size={12} style={{ color: '#bb88ff' }} />
        <span style={{ fontSize: '0.62rem', letterSpacing: '2px', color: '#bb88ff', fontFamily: 'Rajdhani, sans-serif', flex: 1 }}>RAG SYNTHESIS</span>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(187,136,255,0.5)', padding: 2 }}>
            <X size={11} />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2" style={{ fontSize: '0.72rem', color: 'rgba(187,136,255,0.7)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
          <RefreshCw size={11} className="animate-spin" /> SYNTHESIZING FROM RETRIEVED CONTEXT...
        </div>
      )}

      {error && <div style={{ fontSize: '0.72rem', color: '#ff6666' }}>{error}</div>}

      {answer && !loading && (
        <div style={{ fontSize: '0.78rem', color: 'rgba(230,220,255,0.92)', lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: 'Rajdhani, sans-serif' }}>
          {renderWithCitations(answer, sources)}
        </div>
      )}

      {answer && sources.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(187,136,255,0.15)', paddingTop: 7, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {sources.map(s => (
            <div key={s.n} className="flex items-center gap-2" style={{ fontSize: '0.62rem', color: 'rgba(187,136,255,0.55)', minWidth: 0 }}>
              <span style={{ color: '#bb88ff', flexShrink: 0 }}>[{s.n}]</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.title}</span>
              {s.url && (
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(187,136,255,0.5)', flexShrink: 0 }} title={s.url}>
                  <ExternalLink size={9} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}