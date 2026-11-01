import React, { useState, useCallback, useEffect } from 'react';
import { Download, RefreshCw, Database, Check } from 'lucide-react';
import PageShell from '@/components/tools/PageShell';
import { loadEsEndpoints, ES_ACTIVE_LS_KEY, saveActiveEsEndpoint } from '@/lib/esEndpoints';

const FORMATS = [
  { id: 'json', label: 'JSON', desc: 'Pretty-printed, keyed by index' },
  { id: 'ndjson', label: 'NDJSON', desc: 'One document per line — bulk-ready' },
  { id: 'csv', label: 'CSV', desc: 'Flattened columns, one row per document' },
];

const LIMITS = [100, 500, 1000, 5000, 10000];

const logColors = { info: 'rgba(0,255,204,0.6)', ok: '#00cc66', warn: '#ffaa00', error: '#ff4444' };

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function csvCell(value) {
  const s = value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(records) {
  if (records.length === 0) return '';
  const cols = [];
  const seen = new Set();
  records.forEach(r => Object.keys(r).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
  return [cols.join(','), ...records.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n');
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

export default function DataExport() {
  const endpoints = loadEsEndpoints();
  const [activeEp, setActiveEp] = useState(() => Math.min(parseInt(localStorage.getItem(ES_ACTIVE_LS_KEY) || '0', 10), Math.max(0, endpoints.length - 1)));
  const [indices, setIndices] = useState([]);
  const [selected, setSelected] = useState([]);
  const [format, setFormat] = useState('json');
  const [limit, setLimit] = useState(500);
  const [loadingIdx, setLoadingIdx] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [lastExport, setLastExport] = useState(null);

  const ep = endpoints[activeEp]?.url;

  const addLog = useCallback((msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [...prev, { ts, msg, type }]);
  }, []);

  const loadIndices = useCallback(async (baseUrl = ep) => {
    if (!baseUrl) return;
    setLoadingIdx(true);
    setError('');
    try {
      const res = await fetch(`${baseUrl}/_cat/indices?format=json&h=index,docs.count,store.size`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = (json || [])
        .filter(i => !String(i.index).startsWith('.'))
        .map(i => ({ index: i.index, docs: parseInt(i['docs.count'] || '0', 10) || 0, size: i['store.size'] || '—' }))
        .sort((a, b) => a.index.localeCompare(b.index));
      setIndices(list);
      setSelected(list.map(i => i.index));
    } catch (e) {
      setError(e.message);
      setIndices([]);
      setSelected([]);
    } finally {
      setLoadingIdx(false);
    }
  }, [ep]);

  useEffect(() => {
    loadIndices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEp]);

  const selectEp = (i) => {
    setActiveEp(i);
    saveActiveEsEndpoint(i);
  };

  const toggleIndex = (name) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const estimatedRows = indices
    .filter(i => selected.includes(i.index))
    .reduce((sum, i) => sum + Math.min(i.docs, limit), 0);

  const runExport = async () => {
    if (!ep) { setError('No Elasticsearch endpoint configured'); return; }
    if (selected.length === 0) { setError('Select at least one index to export'); return; }
    setRunning(true);
    setError('');
    setLog([]);
    setLastExport(null);
    const started = Date.now();

    const jsonPayload = {};
    const ndjsonLines = [];
    const csvRecords = [];
    let docCount = 0;

    try {
      for (const idx of selected) {
        addLog(`Fetching ${idx} (limit ${limit.toLocaleString()})…`);
        const res = await fetch(`${ep}/${idx}/_search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ size: limit, sort: ['_doc'], query: { match_all: {} } }),
        });
        if (!res.ok) { addLog(`${idx}: HTTP ${res.status} — skipped`, 'error'); continue; }
        const json = await res.json();
        const hits = json.hits?.hits || [];
        docCount += hits.length;
        addLog(`${idx}: ${hits.length} documents`, 'ok');

        if (format === 'json') {
          jsonPayload[idx] = hits.map(h => ({ _id: h._id, ...h._source }));
        } else {
          hits.forEach(h => {
            const row = { _index: idx, _id: h._id, ...h._source };
            if (format === 'ndjson') ndjsonLines.push(JSON.stringify(row));
            else csvRecords.push(row);
          });
        }
      }

      if (docCount === 0) {
        addLog('No documents found for the selected indices', 'warn');
        return;
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      let text, filename, mime;
      if (format === 'json') {
        text = JSON.stringify(jsonPayload, null, 2);
        filename = `tactical-export-${stamp}.json`;
        mime = 'application/json';
      } else if (format === 'ndjson') {
        text = ndjsonLines.join('\n') + '\n';
        filename = `tactical-export-${stamp}.ndjson`;
        mime = 'application/x-ndjson';
      } else {
        text = toCsv(csvRecords);
        filename = `tactical-export-${stamp}.csv`;
        mime = 'text/csv';
      }

      download(filename, text, mime);
      setLastExport({ filename, docs: docCount, bytes: new Blob([text]).size, ms: Date.now() - started, indices: selected.length });
      addLog(`Downloaded ${filename} (${docCount.toLocaleString()} documents)`, 'ok');
    } catch (e) {
      setError(e.message);
      addLog(e.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <PageShell
      title="DATA EXPORT"
      subtitle="OFFLINE EXPORT OF YOUR ELASTICSEARCH DATA TO A STRUCTURED FILE"
      icon={Download}
    >
      <div className="tactical-panel rounded p-4 flex flex-col gap-4" style={{ minHeight: '70vh' }}>

        {/* Endpoint selector */}
        <div className="flex flex-wrap items-center gap-2">
          <Database size={12} style={{ color: 'var(--neon-primary)' }} />
          {endpoints.map((e, i) => (
            <button key={i} onClick={() => selectEp(i)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 10px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: i === activeEp ? 'rgba(0,255,204,0.08)' : 'transparent', color: i === activeEp ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)' }}>
              {e.label}
            </button>
          ))}
          <button className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1 ml-auto" onClick={() => loadIndices()} disabled={loadingIdx}>
            <RefreshCw size={10} className={loadingIdx ? 'animate-spin' : ''} /> RELOAD INDICES
          </button>
        </div>

        {error && <div style={{ color: '#ff4444', fontSize: '0.75rem', padding: '7px 11px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

        {/* Index picker */}
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px' }}>
              INDICES ({selected.length}/{indices.length})
            </span>
            <button onClick={() => setSelected(indices.map(i => i.index))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', fontSize: '0.6rem', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>SELECT ALL</button>
            <button onClick={() => setSelected([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', fontSize: '0.6rem', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>NONE</button>
            {loadingIdx && <RefreshCw size={10} className="animate-spin" style={{ color: 'var(--neon-primary)' }} />}
          </div>

          {indices.length === 0 && !loadingIdx ? (
            <div style={{ fontSize: '0.72rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '1px', fontFamily: 'Rajdhani, sans-serif', padding: '14px 0' }}>
              NO INDICES FOUND ON THIS ENDPOINT
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {indices.map(i => {
                const on = selected.includes(i.index);
                return (
                  <button key={i.index} onClick={() => toggleIndex(i.index)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '5px 10px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${on ? 'rgba(0,255,204,0.3)' : 'rgba(0,255,204,0.08)'}`, background: on ? 'rgba(0,255,204,0.05)' : 'transparent' }}>
                    <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 2, border: `1px solid ${on ? 'var(--neon-primary)' : 'rgba(0,255,204,0.3)'}`, background: on ? 'var(--neon-primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Check size={9} style={{ color: '#000' }} />}
                    </span>
                    <span style={{ flex: 1, fontFamily: 'Rajdhani, sans-serif', fontSize: '0.75rem', color: on ? 'var(--neon-primary)' : 'rgba(0,255,204,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.index}</span>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.3)', fontFamily: 'Rajdhani, sans-serif', flexShrink: 0 }}>
                      {Math.min(i.docs, limit).toLocaleString()} / {i.docs.toLocaleString()} DOCS
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.22)', fontFamily: 'Rajdhani, sans-serif', flexShrink: 0, width: 60, textAlign: 'right' }}>{i.size}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Format + limit */}
        <div className="flex flex-wrap gap-4">
          <div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>FILE FORMAT</div>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(f => (
                <button key={f.id} onClick={() => setFormat(f.id)} title={f.desc}
                  style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1.5px', padding: '4px 11px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${format === f.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: format === f.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: format === f.id ? 'rgba(0,255,204,0.07)' : 'transparent' }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 5 }}>ROW LIMIT PER INDEX</div>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 3, fontSize: '0.75rem', minWidth: 110 }}>
              {LIMITS.map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>
          </div>
        </div>

        <div style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
          {FORMATS.find(f => f.id === format)?.desc.toUpperCase()} — UP TO {estimatedRows.toLocaleString()} DOCUMENTS ACROSS {selected.length} INDEX{selected.length === 1 ? '' : 'ES'}
        </div>

        <button className="neon-btn px-5 py-3 rounded text-sm flex items-center justify-center gap-2 font-bold tracking-widest"
          onClick={runExport} disabled={running || selected.length === 0}>
          {running ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
          {running ? 'EXPORTING…' : 'RUN EXPORT'}
        </button>

        {lastExport && (
          <div style={{ background: 'rgba(0,204,102,0.06)', border: '1px solid rgba(0,204,102,0.25)', borderRadius: 4, padding: '10px 13px', fontSize: '0.72rem', color: '#00cc66', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>
            ✓ {lastExport.filename} — {lastExport.docs.toLocaleString()} DOCS · {fmtBytes(lastExport.bytes)} · {lastExport.indices} INDEX{lastExport.indices === 1 ? '' : 'ES'} · {(lastExport.ms / 1000).toFixed(1)}s
          </div>
        )}

        {/* Export log */}
        <div>
          <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '2px', marginBottom: 6 }}>EXPORT LOG</div>
          <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '8px 10px', height: 170, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {log.length === 0 && <span style={{ color: 'rgba(0,255,204,0.2)', letterSpacing: '1px' }}>Awaiting export…</span>}
            {log.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: 'rgba(0,255,204,0.25)', flexShrink: 0 }}>{entry.ts}</span>
                <span style={{ color: logColors[entry.type] || logColors.info }}>{entry.msg}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.22)', letterSpacing: '1.5px', fontFamily: 'Rajdhani, sans-serif' }}>
          FILES ARE BUILT IN YOUR BROWSER AND SAVED LOCALLY — NOTHING IS UPLOADED
        </div>
      </div>
    </PageShell>
  );
}