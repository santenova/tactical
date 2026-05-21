import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { RefreshCw, Download } from 'lucide-react';
import { INDEX_PREFIX } from './CorePanel';

const STOP_WORDS = new Set(['the','a','an','and','or','of','to','in','is','it','for','on','with','at','by','this','that','are','was','were','be','been','has','have','had','will','can','from','as','up','about','into','than','then','so','if','not','but','no','do','did','what','how','which','their','its','your','we','our','they','them','these','those','more','also','other','some','any','all','one','two','would','could','should','may','might','very','just','like','get','use','used','using','new','first','last','after','before','each','when']);

function extractKeywords(text, n = 10) {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }));
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

const COLORS = ['#00ffcc', '#00d4ff', '#7eb8ff', '#a78bfa', '#f0abfc', '#ffcc00', '#ff6b6b', '#00cc66', '#ff9500', '#00e5ff'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(0,10,10,0.95)', border: '1px solid rgba(0,255,204,0.2)', borderRadius: 4, padding: '8px 12px', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.75rem', color: 'var(--neon-primary)' }}>
      <div style={{ color: 'rgba(0,255,204,0.5)', marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => <div key={i}>{p.name}: <strong>{p.value}</strong></div>)}
    </div>
  );
};

export default function KnowledgeCoreViz({ esEndpoints, activeES, onSelectES }) {
  const [indices, setIndices] = useState([]);
  const [activeIndex, setActiveIndex] = useState('');
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totalDocs, setTotalDocs] = useState(0);

  const esEp = esEndpoints[activeES];

  // Load all knowledge_core_* indices
  const loadIndices = useCallback(async () => {
    if (!esEp) return;
    const res = await fetch(`${esEp.url}/_cat/indices/${INDEX_PREFIX}*?format=json`);
    if (!res.ok) { setIndices([]); return; }
    const json = await res.json();
    const names = (json || []).map(i => i.index).sort();
    setIndices(names);
    if (names.length > 0 && !activeIndex) setActiveIndex(names[0]);
  }, [esEp, activeIndex]);

  const loadDocs = useCallback(async () => {
    if (!esEp || !activeIndex) return;
    setLoading(true);
    setError('');
    try {
      const countRes = await fetch(`${esEp.url}/${activeIndex}/_count`);
      const countJson = await countRes.json();
      setTotalDocs(countJson.count || 0);

      // Fetch up to 500 docs (no source for embedding to save memory)
      const res = await fetch(`${esEp.url}/${activeIndex}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: 500,
          _source: ['query', 'title', 'url', 'snippet', 'scraped_at'],
          query: { match_all: {} },
          sort: [{ scraped_at: { order: 'desc' } }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDocs((json.hits?.hits || []).map(h => h._source));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [esEp, activeIndex]);

  useEffect(() => { loadIndices(); }, [esEp]);
  useEffect(() => { if (activeIndex) loadDocs(); }, [activeIndex]);

  const exportDocs = useCallback((format) => {
    if (!docs.length) return;
    let content, mime, ext;
    if (format === 'json') {
      content = JSON.stringify(docs, null, 2);
      mime = 'application/json'; ext = 'json';
    } else {
      const headers = ['query', 'title', 'url', 'snippet', 'scraped_at'];
      const rows = docs.map(d => headers.map(h => `"${String(d[h] || '').replace(/"/g, '""')}"`).join(','));
      content = [headers.join(','), ...rows].join('\n');
      mime = 'text/csv'; ext = 'csv';
    }
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeIndex}_export_${new Date().toISOString().slice(0,10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [docs, activeIndex]);

  const bulkExportByQuery = useCallback(() => {
    if (!docs.length) return;
    const grouped = {};
    docs.forEach(d => {
      const q = d.query || 'unknown';
      if (!grouped[q]) grouped[q] = [];
      grouped[q].push({ title: d.title, url: d.url, snippet: d.snippet, scraped_at: d.scraped_at });
    });
    const lines = [];
    Object.entries(grouped).forEach(([q, items]) => {
      lines.push(`${'='.repeat(60)}`);
      lines.push(`QUERY: ${q}  (${items.length} docs)`);
      lines.push(`${'='.repeat(60)}`);
      items.forEach((item, i) => {
        lines.push(`\n[${i + 1}] ${item.title}`);
        lines.push(`URL: ${item.url}`);
        lines.push(`DATE: ${item.scraped_at?.slice(0, 10) || '—'}`);
        lines.push(`${item.snippet || ''}`);
      });
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeIndex}_bulk_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [docs, activeIndex]);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Scrape frequency by query
  const scrapeByQuery = (() => {
    const freq = {};
    docs.forEach(d => { if (d.query) freq[d.query] = (freq[d.query] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([query, count]) => ({ query: query.length > 22 ? query.slice(0, 22) + '…' : query, count, full: query }));
  })();

  // Docs per day (scrape timeline)
  const timeline = (() => {
    const byDay = {};
    docs.forEach(d => {
      if (!d.scraped_at) return;
      const day = d.scraped_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    return Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date: date.slice(5), count }));
  })();

  // Top domains
  const domainData = (() => {
    const freq = {};
    docs.forEach(d => { if (d.url) { const dom = extractDomain(d.url); freq[dom] = (freq[dom] || 0) + 1; } });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, count]) => ({ domain, count }));
  })();

  // Top keywords from all snippets+titles
  const allText = docs.map(d => `${d.title || ''} ${d.snippet || ''}`).join(' ');
  const keywordData = extractKeywords(allText, 15);

  if (esEndpoints.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(0,255,204,0.25)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.8rem' }}>
        NO ELASTICSEARCH ENDPOINTS — CONFIGURE IN DB TAB
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {esEndpoints.length > 1 && esEndpoints.map((e, i) => (
          <button key={i} onClick={() => { onSelectES(i); setActiveIndex(''); setDocs([]); }}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${i === activeES ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, background: i === activeES ? 'rgba(0,255,204,0.08)' : 'transparent', color: i === activeES ? 'var(--neon-primary)' : 'rgba(0,255,204,0.45)' }}>{e.label}</button>
        ))}

        <div style={{ height: 14, width: 1, background: 'rgba(0,255,204,0.15)' }} />

        {indices.map(idx => (
          <button key={idx} onClick={() => setActiveIndex(idx)}
            style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.65rem', letterSpacing: '1px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${activeIndex === idx ? '#7eb8ff' : 'rgba(0,255,204,0.2)'}`, background: activeIndex === idx ? 'rgba(126,184,255,0.08)' : 'transparent', color: activeIndex === idx ? '#7eb8ff' : 'rgba(0,255,204,0.45)' }}>
            {idx.replace(INDEX_PREFIX, '')}
          </button>
        ))}

        {indices.length === 0 && !loading && (
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,150,100,0.6)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px' }}>No knowledge_core_* indices found</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => exportDocs('json')} className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" disabled={docs.length === 0} title="Export current docs as JSON">
            <Download size={10} /> JSON
          </button>
          <button onClick={() => exportDocs('csv')} className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" disabled={docs.length === 0} title="Export current docs as CSV">
            <Download size={10} /> CSV
          </button>
          <button onClick={bulkExportByQuery} className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" disabled={docs.length === 0} title="Bulk export raw content grouped by query">
            <Download size={10} /> BULK
          </button>
          <button onClick={() => { loadIndices(); loadDocs(); }} className="neon-btn px-3 py-1 rounded text-xs flex items-center gap-1" disabled={loading}>
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> REFRESH
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#ff4444', fontSize: '0.75rem', padding: '6px 10px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>{error}</div>}

      {/* Summary stats */}
      {docs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'TOTAL DOCS', value: totalDocs },
            { label: 'UNIQUE QUERIES', value: scrapeByQuery.length },
            { label: 'UNIQUE DOMAINS', value: domainData.length },
            { label: 'TOP KEYWORD', value: keywordData[0]?.word || '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'rgba(0,255,204,0.04)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1.5px', marginBottom: 4 }}>{label}</div>
              <div style={{ color: 'var(--neon-primary)', fontSize: '1.1rem', fontWeight: 700, fontFamily: 'Rajdhani, sans-serif' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.3)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <RefreshCw size={12} className="animate-spin" /> LOADING CORE DATA...
        </div>
      )}

      {!loading && docs.length === 0 && activeIndex && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(0,255,204,0.2)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '2px', fontSize: '0.75rem' }}>
          NO DOCUMENTS IN INDEX YET — START INGESTION FIRST
        </div>
      )}

      {docs.length > 0 && (
        <div className="flex flex-col gap-4">

          {/* Row 1: Scrape timeline + Scrape by query */}
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Timeline */}
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 10 }}>SCRAPE TIMELINE</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,204,0.06)" />
                  <XAxis dataKey="date" tick={{ fill: 'rgba(0,255,204,0.35)', fontSize: 10, fontFamily: 'Rajdhani, sans-serif' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(0,255,204,0.35)', fontSize: 10, fontFamily: 'Rajdhani, sans-serif' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="count" name="docs" stroke="var(--neon-primary)" strokeWidth={1.5} dot={{ fill: 'var(--neon-primary)', r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Scrape by query */}
            <div style={{ flex: 1.2, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 10 }}>DOCS PER QUERY</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={scrapeByQuery} layout="vertical">
                  <XAxis type="number" tick={{ fill: 'rgba(0,255,204,0.35)', fontSize: 9, fontFamily: 'Rajdhani, sans-serif' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="query" width={110} tick={{ fill: 'rgba(0,255,204,0.55)', fontSize: 9, fontFamily: 'Rajdhani, sans-serif' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="docs" fill="var(--neon-primary)" radius={[0, 2, 2, 0]} fillOpacity={0.75} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: Top domains pie + Top keywords bar */}
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Domains pie */}
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 10 }}>TOP DOMAINS</div>
              <div className="flex gap-3 items-center">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={domainData} dataKey="count" nameKey="domain" cx="50%" cy="50%" outerRadius={70} innerRadius={35} strokeWidth={0}>
                      {domainData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 flex-1" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {domainData.map((d, i) => (
                    <div key={d.domain} className="flex items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.6)', fontFamily: 'Rajdhani, sans-serif', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.domain}</span>
                      <span style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.35)', fontFamily: 'Rajdhani, sans-serif' }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Keywords bar */}
            <div style={{ flex: 1.3, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 10 }}>TOP KEYWORDS (from snippets)</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={keywordData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,204,0.06)" vertical={false} />
                  <XAxis dataKey="word" tick={{ fill: 'rgba(0,255,204,0.45)', fontSize: 9, fontFamily: 'Rajdhani, sans-serif' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={40} />
                  <YAxis tick={{ fill: 'rgba(0,255,204,0.35)', fontSize: 9, fontFamily: 'Rajdhani, sans-serif' }} axisLine={false} tickLine={false} width={25} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="freq" fill="#7eb8ff" radius={[2, 2, 0, 0]} fillOpacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent docs table */}
          <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 8 }}>RECENT DOCUMENTS (latest 20)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', fontFamily: 'Rajdhani, sans-serif' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(0,255,204,0.12)' }}>
                    {['QUERY', 'TITLE', 'DOMAIN', 'DATE'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: 'rgba(0,255,204,0.35)', letterSpacing: '1.5px', fontSize: '0.58rem', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.slice(0, 20).map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(0,255,204,0.05)' }}>
                      <td style={{ padding: '4px 8px', color: 'rgba(0,255,204,0.5)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.query}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(0,255,204,0.75)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(0,255,204,0.5)' }}>{extractDomain(d.url || '')}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(0,255,204,0.35)' }}>{d.scraped_at ? d.scraped_at.slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}