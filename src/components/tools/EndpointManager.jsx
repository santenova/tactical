import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Plus, Trash2, X, Server } from 'lucide-react';

const DEFAULT_ENDPOINTS = [
  'http://localhost:11434',
  'http://127.0.0.1:11434',
];

export default function EndpointManager({ endpoints, onEndpointsChange, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const val = newVal.trim().replace(/\/$/, '');
    if (!val) return;
    if (!/^https?:\/\/.+/.test(val)) { setError('Must start with http:// or https://'); return; }
    if (endpoints.includes(val)) { setError('Endpoint already exists'); return; }
    onEndpointsChange([...endpoints, val]);
    onSelect(val);
    setNewVal('');
    setError('');
  };

  const handleRemove = (ep) => {
    const next = endpoints.filter(e => e !== ep);
    onEndpointsChange(next);
    if (selected === ep) onSelect(next[0] || DEFAULT_ENDPOINTS[0]);
  };

  return (
    <>
      <button
        className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1"
        onClick={() => setOpen(true)}
        title="Manage endpoints"
        data-desc="Add / Manage Ollama Endpoints"
      >
        <Server size={12} /> ENDPOINTS
      </button>

      {open && ReactDOM.createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 99999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded flex flex-col gap-4"
            style={{
              background: 'rgba(0,10,10,0.97)',
              border: '1px solid rgba(0,255,204,0.25)',
              boxShadow: '0 0 40px rgba(0,255,204,0.08)',
              width: '420px',
              maxWidth: '95vw',
              padding: '20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--neon-primary)' }}>
                MANAGE ENDPOINTS
              </span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(0,255,204,0.5)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {endpoints.map(ep => (
                <div
                  key={ep}
                  className="flex items-center gap-2 rounded px-3 py-2 cursor-pointer"
                  style={{
                    background: selected === ep ? 'rgba(0,255,204,0.1)' : 'rgba(0,20,20,0.6)',
                    border: `1px solid ${selected === ep ? 'rgba(0,255,204,0.35)' : 'rgba(0,255,204,0.1)'}`,
                    transition: 'all 0.15s',
                  }}
                  onClick={() => { onSelect(ep); }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: selected === ep ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)' }}
                  />
                  <span className="flex-1 text-xs truncate" style={{ color: 'rgba(0,255,204,0.8)', fontFamily: 'monospace' }}>
                    {ep}
                  </span>
                  {!DEFAULT_ENDPOINTS.includes(ep) && (
                    <button
                      onClick={e => { e.stopPropagation(); handleRemove(ep); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'rgba(255,51,51,0.5)' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid rgba(0,255,204,0.08)' }}>
              <span className="text-xs tracking-widest opacity-50 uppercase">ADD ENDPOINT</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 rounded text-xs"
                  placeholder="http://192.168.1.x:11434"
                  value={newVal}
                  onChange={e => { setNewVal(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <button className="neon-btn px-3 py-2 rounded text-xs flex items-center gap-1" onClick={handleAdd}>
                  <Plus size={12} /> ADD
                </button>
              </div>
              {error && <span className="text-xs" style={{ color: 'var(--neon-alert)' }}>{error}</span>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}