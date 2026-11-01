import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const time = new Date(message.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const copy = () => {
    navigator.clipboard.writeText(message.content || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col" style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
      <div className="flex items-center gap-2 mb-1" style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}>
        <span style={{ fontSize: '0.55rem', letterSpacing: '1.5px', color: isUser ? 'rgba(255,255,255,0.4)' : 'var(--neon-primary)' }}>
          {isUser ? 'YOU' : 'AI'}
        </span>
        <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.2)' }}>{time}</span>
        {message.meta?.model && (
          <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.3)' }}>
            {message.meta.model} · {message.meta.time} · {message.meta.tokens}t
          </span>
        )}
        {message.stopped && <span style={{ fontSize: '0.55rem', color: '#ffaa00', letterSpacing: '1px' }}>STOPPED</span>}
      </div>

      <div style={{
        padding: '8px 12px',
        borderRadius: 4,
        fontSize: isUser ? '0.85rem' : '0.8rem',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: isUser ? 'rgba(0,255,204,0.07)' : 'rgba(0,10,10,0.7)',
        border: `1px solid ${isUser ? 'rgba(0,255,204,0.25)' : 'rgba(0,255,204,0.1)'}`,
        color: isUser ? 'rgba(0,255,204,0.9)' : 'rgba(0,255,204,0.8)',
        fontFamily: isUser ? 'Rajdhani, sans-serif' : 'monospace',
      }}>
        {message.content || '▋'}
      </div>

      {!isUser && message.content && (
        <button onClick={copy} className="flex items-center gap-1 mt-1"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.35)', fontSize: '0.55rem', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
          {copied ? <Check size={9} /> : <Copy size={9} />} {copied ? 'COPIED' : 'COPY'}
        </button>
      )}
    </div>
  );
}