import React, { useState } from 'react';
import { Globe, Plus, Trash2, RefreshCw, Play, CheckCircle, AlertCircle } from 'lucide-react';

const LS_KEY = 'tactical_browserless_endpoints';

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || [{ url: 'http://localhost:3000', token: '', label: 'Local' }]; }
  catch { return [{ url: 'http://localhost:3000', token: '', label: 'Local' }]; }
}
function save(eps) { localStorage.setItem(LS_KEY, JSON.stringify(eps)); }

const TESTS = [
  { id: 'config', label: 'GET /config', desc: 'Fetch Browserless config / health' },
  { id: 'screenshot', label: 'Screenshot Test', desc: 'Take screenshot of example.com' },
  { id: 'pdf', label: 'PDF Test', desc: 'Generate PDF of example.com' },
  { id: 'content', label: 'Content Test', desc: 'Scrape text from example.com' },
];

export default function BrowserlessPanel() {
  const [endpoints, setEndpoints] = useState(load);
  const [activeEp, setActiveEp] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newToken, setNewToken] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});
  const [customScript, setCustomScript] = useState(`module.exports = async ({ page }) => {\n  await page.goto('https://example.com');\n  return await page.title();\n};`);
  const [scriptResult, setScriptResult] = useState('');
  const [scriptRunning, setScriptRunning] = useState(false);

  const ep = endpoints[activeEp];

  const addEp = () => {
    if (!newUrl.trim()) return;
    const next = [...endpoints, { url: newUrl.trim(), token: newToken.trim(), label: newLabel || newUrl.trim() }];
    setEndpoints(next); save(next);
    setNewUrl(''); setNewToken(''); setNewLabel(''); setShowAdd(false);
    setActiveEp(next.length - 1);
  };

  const removeEp = (i) => {
    const next = endpoints.filter((_, idx) => idx !== i);
    setEndpoints(next); save(next);
    if (activeEp >= next.length) setActiveEp(Math.max(0, next.length - 1));
  };

  const updateToken = (token) => {
    const next = endpoints.map((e, i) => i === activeEp ? { ...e, token } : e);
    setEndpoints(next); save(next);
  };

  const runTest = async (testId) => {
    if (!ep) return;
    setRunning(p => ({ ...p, [testId]: true }));
    setResults(p => ({ ...p, [testId]: null }));
    const headers = { 'Content-Type': 'application/json', ...(ep.token ? { Authorization: `Bearer ${ep.token}` } : {}) };
    try {
      let res, status, resultData, imgUrl;
      if (testId === 'config') {
        res = await fetch(`${ep.url}/config`, { headers });
        const data = await res.json();
        status = res.ok ? 'ok' : 'error';
        resultData = JSON.stringify(data, null, 2);
      } else if (testId === 'screenshot') {
        res = await fetch(`${ep.url}/screenshot`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://example.com' }) });
        status = res.ok ? 'ok' : 'error';
        if (res.ok) {
          const blob = await res.blob();
          imgUrl = URL.createObjectURL(blob);
          resultData = 'Screenshot captured';
        } else {
          resultData = await res.text();
        }
      } else if (testId === 'pdf') {
        res = await fetch(`${ep.url}/pdf`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://example.com' }) });
        status = res.ok ? 'ok' : 'error';
        const pdfText = res.ok ? `PDF generated — ${res.headers.get('content-length') || '?'} bytes` : await res.text();
        resultData = pdfText;
      } else if (testId === 'content') {
        res = await fetch(`${ep.url}/content`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://example.com' }) });
        status = res.ok ? 'ok' : 'error';
        const text = await res.text();
        resultData = text.slice(0, 500) + (text.length > 500 ? '…' : '');
      }
      setResults(p => ({ ...p, [testId]: { status, data: resultData, imgUrl } }));
    } catch (e) {
      setResults(p => ({ ...p, [testId]: { status: 'error', data: e.message } }));
    } finally {
      setRunning(p => ({ ...p, [testId]: false }));
    }
  };

  const runScript = async () => {
    if (!ep || !customScript.trim()) return;
    setScriptRunning(true);
    setScriptResult('');
    try {
      const headers = { 'Content-Type': 'application/javascript', ...(ep.token ? { Authorization: `Bearer ${ep.token}` } : {}) };
      const res = await fetch(`${ep.url}/function`, { method: 'POST', headers, body: customScript });
      const text = await res.text();
      setScriptResult(text);
    } catch (e) { setScriptResult('Error: ' + e.message); }
    finally { setScriptRunning(false); }
  };

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3" style={{ minHeight: '70vh' }}>
      <div className="flex items-center gap-2">
        <Globe size={13} style={{ color: 'var(--neon-primary)' }} />
        <span className="neon-text text-xs tracking-widest uppercase flex-1">BROWSERLESS</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {endpoints.map((e, i) => (
          <div key={i} className="flex items-center gap-1">
            <button onClick={() => setActiveEp(i)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.7rem', letterSpacing: '1px', padding: '3px 10px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: i === activeEp ? 'rgba(0,255,204,0.08)' : 'transparent', color: i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.5)' }}
            >{e.label}</button>
            {endpoints.length > 1 && (
              <button onClick={() => removeEp(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,60,60,0.4)' }}>
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setShowAdd(v => !v)} className="neon-btn px-2 py-1 rounded text-xs flex items-center gap-1">
          <Plus size={10} /> ADD
        </button>
      </div>

      {showAdd && (
        <div className="flex gap-2 flex-wrap">
          <input type="text" placeholder="Label" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ width: 80, padding: '4px 8px', borderRadius: 3, fontSize: '0.75rem' }} />
          <input type="text" placeholder="http://..." value={newUrl} onChange={e => setNewUrl(e.target.value)} style={{ flex: 1, padding: '4px 8px', borderRadius: 3, fontSize: '0.75rem' }} />
          <input type="text" placeholder="API Token (opt)" value={newToken} onChange={e => setNewToken(e.target.value)} style={{ width: 130, padding: '4px 8px', borderRadius: 3, fontSize: '0.75rem' }} />
          <button className="neon-btn px-3 py-1 rounded text-xs" onClick={addEp}>SAVE</button>
        </div>
      )}

      {ep && (
        <div className="flex gap-2 items-center">
          <span style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', whiteSpace: 'nowrap' }}>TOKEN</span>
          <input type="password" placeholder="API Token..." value={ep.token} onChange={e => updateToken(e.target.value)}
            style={{ flex: 1, padding: '5px 10px', borderRadius: 3, fontSize: '0.75rem' }} />
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.3)', whiteSpace: 'nowrap' }}>{ep.url}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {TESTS.map(t => {
          const r = results[t.id];
          const busy = running[t.id];
          return (
            <div key={t.id} style={{ background: 'rgba(0,10,10,0.6)', border: `1px solid ${r?.status === 'ok' ? 'rgba(0,255,100,0.25)' : r?.status === 'error' ? 'rgba(255,50,50,0.25)' : 'rgba(0,255,204,0.1)'}`, borderRadius: 4, padding: 10 }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: '0.68rem', letterSpacing: '1px', color: 'rgba(0,255,204,0.8)', fontFamily: 'Rajdhani, sans-serif' }}>{t.label}</span>
                {r?.status === 'ok' && <CheckCircle size={11} style={{ color: '#00cc66' }} />}
                {r?.status === 'error' && <AlertCircle size={11} style={{ color: '#ff3333' }} />}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>{t.desc}</div>
              <button onClick={() => runTest(t.id)} disabled={busy || !ep}
                className="neon-btn px-3 py-1 rounded text-xs w-full flex items-center justify-center gap-1">
                {busy ? <RefreshCw size={9} className="animate-spin" /> : <Play size={9} />}
                {busy ? 'RUNNING' : 'RUN'}
              </button>
              {r?.imgUrl && <img src={r.imgUrl} alt="screenshot" style={{ width: '100%', marginTop: 6, borderRadius: 3, border: '1px solid rgba(0,255,204,0.1)' }} />}
              {r?.data && !r.imgUrl && (
                <pre style={{ marginTop: 6, fontSize: '0.62rem', color: r.status === 'error' ? '#ff5555' : 'rgba(0,255,204,0.6)', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>{r.data}</pre>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 6 }}>CUSTOM FUNCTION SCRIPT</div>
        <textarea value={customScript} onChange={e => setCustomScript(e.target.value)}
          rows={5} className="w-full rounded px-3 py-2" style={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
        <button onClick={runScript} disabled={scriptRunning || !ep} className="neon-btn px-4 py-2 rounded text-xs flex items-center gap-2 mt-2">
          {scriptRunning ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}
          {scriptRunning ? 'RUNNING...' : 'RUN FUNCTION'}
        </button>
        {scriptResult && (
          <pre style={{ marginTop: 8, fontSize: '0.7rem', color: 'rgba(0,255,204,0.65)', background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: 4, border: '1px solid rgba(0,255,204,0.1)', whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto' }}>{scriptResult}</pre>
        )}
      </div>
    </div>
  );
}