import React, { useRef, useEffect, useState } from 'react';
import { Copy, Check, Code, Monitor } from 'lucide-react';

function extractHtml(text) {
  if (/<html[\s>]/i.test(text)) {
    const match = text.match(/<!DOCTYPE[\s\S]*?<\/html>/i) || text.match(/<html[\s\S]*?<\/html>/i);
    if (match) return match[0];
  }
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  if (/<body|<div|<style|<script/i.test(text)) return text;
  return null;
}

export default function OutputViewer({ output }) {
  const outputRef = useRef(null);
  const [tab, setTab] = useState('raw');
  const [copied, setCopied] = useState(false);

  const htmlContent = extractHtml(output || '');
  const hasHtml = !!htmlContent;

  useEffect(() => {
    if (!output) setTab('raw');
  }, [output]);

  useEffect(() => {
    if (tab === 'raw' && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, tab]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const tabBtn = (id, label, TabIcon) => (
    <button
      onClick={() => setTab(id)}
      className="flex items-center gap-1 px-3 py-1 rounded text-xs tracking-widest uppercase transition-all"
      style={{
        background: tab === id ? 'rgba(0,255,204,0.12)' : 'transparent',
        border: `1px solid ${tab === id ? 'rgba(0,255,204,0.4)' : 'rgba(0,255,204,0.1)'}`,
        color: tab === id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)',
        cursor: 'pointer',
        fontFamily: 'Rajdhani, sans-serif',
        letterSpacing: '2px',
      }}
    >
      <TabIcon size={11} /> {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {tabBtn('raw', 'RAW', Code)}
          {hasHtml && tabBtn('preview', 'PREVIEW', Monitor)}
        </div>
        <button
          className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1"
          onClick={handleCopy}
          disabled={!output}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>

      {tab === 'raw' && (
        <div
          ref={outputRef}
          className="rounded p-3 min-h-[120px] max-h-64 overflow-y-auto text-sm whitespace-pre-wrap"
          style={{
            background: 'rgba(0,10,10,0.6)',
            border: '1px solid rgba(0,255,204,0.1)',
            color: 'rgba(0,255,204,0.85)',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            lineHeight: 1.6,
          }}
        >
          {output || <span style={{ color: 'rgba(0,255,204,0.3)' }}>_ awaiting input...</span>}
        </div>
      )}

      {tab === 'preview' && (
        <div
          className="rounded overflow-hidden"
          style={{ border: '1px solid rgba(0,255,204,0.2)', height: '256px' }}
        >
          <iframe
            key={htmlContent}
            title="Live Preview"
            srcDoc={htmlContent || ''}
            sandbox="allow-scripts"
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        </div>
      )}
    </div>
  );
}