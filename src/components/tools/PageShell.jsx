import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PageShell({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="min-h-screen bg-background relative">
      <div className="scanlines" />
      <div className="relative z-10 max-w-6xl mx-auto p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/" className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={11} /> BACK
          </Link>
          <div className="flex items-center gap-2 flex-1">
            {Icon && <Icon size={14} style={{ color: 'var(--neon-primary)' }} />}
            <span className="neon-text text-sm tracking-widest uppercase">{title}</span>
          </div>
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '2px', fontFamily: 'Rajdhani, sans-serif' }}>
            {subtitle}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}