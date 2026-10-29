import React, { useState, useEffect, useMemo } from 'react';
import { Network, RefreshCw, X } from 'lucide-react';
import KeywordGraphCanvas from './KeywordGraphCanvas';
import { buildGraph, computeLayout, fetchPersonalCores, colorForCore } from '@/lib/coreGraph';
import { loadPresets } from '@/lib/knowledgePresets';

const SOURCES = [
  { id: 'all', label: 'ALL CORES' },
  { id: 'personal', label: 'PERSONAL' },
  { id: 'preset', label: 'PRESETS' },
];

const label = { fontSize: '0.6rem', color: 'rgba(0,255,204,0.4)', letterSpacing: '2px', marginBottom: 5 };

const chipStyle = (color) => ({
  fontSize: '0.6rem', padding: '2px 8px', borderRadius: 10,
  border: `1px solid ${color}55`, color, fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px',
});

export default function KeywordGraph() {
  const [presets] = useState(loadPresets);
  const [personal, setPersonal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('all');
  const [selected, setSelected] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    fetchPersonalCores()
      .then(res => { if (alive) setPersonal(res.cores); })
      .catch(e => { if (alive) { setError(e.message); setPersonal([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const coreList = useMemo(() => {
    const presetCores = presets.map(p => ({
      id: `preset:${p.name}`, label: p.label, color: p.color, keywords: p.queries || [], kind: 'preset',
    }));
    const personalCores = personal.map(c => ({
      id: `personal:${c.index}`, label: c.label.toUpperCase(), color: colorForCore(c.label), keywords: c.keywords, kind: 'personal',
    }));
    if (source === 'preset') return presetCores;
    if (source === 'personal') return personalCores;
    return [...presetCores, ...personalCores];
  }, [presets, personal, source]);

  const coreMap = useMemo(() => Object.fromEntries(coreList.map(c => [c.id, c])), [coreList]);

  const graph = useMemo(() => buildGraph(coreList, { maxNodes: 140 }), [coreList]);
  const laidOut = useMemo(
    () => ({ ...graph, nodes: computeLayout(graph.nodes, graph.links) }),
    [graph]
  );

  useEffect(() => { setSelected(''); }, [source]);

  const selectedNode = laidOut.nodes.find(n => n.id === selected) || null;

  const related = useMemo(() => {
    if (!selected) return [];
    return laidOut.links
      .filter(l => l.source === selected || l.target === selected)
      .map(l => ({
        id: l.source === selected ? l.target : l.source,
        weight: l.weight,
        cores: l.cores,
      }))
      .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
      .slice(0, 30);
  }, [laidOut, selected]);

  const legend = useMemo(() => {
    const counts = new Map();
    laidOut.nodes.forEach(n => n.cores.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, core: coreMap[id] }))
      .filter(x => x.core)
      .sort((a, b) => b.count - a.count);
  }, [laidOut.nodes, coreMap]);

  return (
    <div className="tactical-panel rounded p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Network size={13} style={{ color: 'var(--neon-primary)' }} />
        <span className="neon-text text-xs tracking-widest uppercase">KEYWORD OVERLAP MAP</span>
        <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px' }}>
          {laidOut.nodes.length} KEYWORDS · {laidOut.links.length} LINKS · {legend.length} CORES
        </span>
        <div className="ml-auto flex items-center gap-1">
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setSource(s.id)}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.6rem', letterSpacing: '1.5px', padding: '3px 9px', borderRadius: 3, cursor: 'pointer', border: `1px solid ${source === s.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.2)'}`, color: source === s.id ? 'var(--neon-primary)' : 'rgba(0,255,204,0.4)', background: source === s.id ? 'rgba(0,255,204,0.07)' : 'transparent' }}>
              {s.label}
            </button>
          ))}
          <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading} title="Rescan saved cores"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', padding: '2px 4px' }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: '0.68rem', color: '#ff4444', padding: '6px 10px', background: 'rgba(255,0,0,0.07)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 3 }}>
          PERSONAL CORES UNAVAILABLE — {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        <div style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, overflow: 'hidden' }}>
          {laidOut.nodes.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'rgba(0,255,204,0.2)', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.72rem', letterSpacing: '2px' }}>
              NO KEYWORDS TO MAP — ADD PRESET QUERIES OR REFINE A PRESET
            </div>
          ) : (
            <KeywordGraphCanvas
              nodes={laidOut.nodes}
              links={laidOut.links}
              cores={coreMap}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>

        {/* Click detail */}
        <div style={{ width: '100%', maxWidth: 320, flexShrink: 0, border: '1px solid rgba(0,255,204,0.1)', borderRadius: 4, padding: '10px 12px', background: 'rgba(0,255,204,0.02)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!selectedNode ? (
            <>
              <div style={label}>KEYWORD DETAIL</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1.5px', lineHeight: 1.8 }}>
                CLICK A KEYWORD NODE TO SEE WHICH CORES HOLD IT AND WHAT IT CONNECTS TO. DRAG NODES TO REARRANGE THE MAP.
              </div>
              <div style={label}>CORES IN VIEW</div>
              <div className="flex flex-wrap gap-1">
                {legend.slice(0, 14).map(({ id, count, core }) => (
                  <span key={id} style={chipStyle(core.color)} title={`${core.kind === 'personal' ? 'Personal core' : 'Preset'} — ${count} keywords mapped`}>
                    {core.label} <span style={{ opacity: 0.5 }}>{count}</span>
                  </span>
                ))}
                {legend.length > 14 && <span style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.3)' }}>+{legend.length - 14} MORE</span>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="neon-text" style={{ fontSize: '0.82rem', letterSpacing: '1.5px', flex: 1, wordBreak: 'break-word' }}>{selectedNode.id}</span>
                <button onClick={() => setSelected('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', padding: 2 }}><X size={12} /></button>
              </div>
              <div style={{ fontSize: '0.58rem', color: 'rgba(0,255,204,0.35)', letterSpacing: '1.5px' }}>
                {selectedNode.cores.length} CORE{selectedNode.cores.length === 1 ? '' : 'S'} · {related.length} RELATED KEYWORDS
              </div>

              <div style={label}>FOUND IN</div>
              <div className="flex flex-wrap gap-1">
                {selectedNode.cores.map(id => {
                  const core = coreMap[id];
                  if (!core) return null;
                  return (
                    <span key={id} style={chipStyle(core.color)} title={core.kind === 'personal' ? 'Personal core' : 'Preset'}>
                      {core.kind === 'personal' ? '◈ ' : '⬡ '}{core.label}
                    </span>
                  );
                })}
              </div>

              <div style={label}>RELATED KEYWORDS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
                {related.length === 0 && (
                  <span style={{ fontSize: '0.62rem', color: 'rgba(0,255,204,0.2)' }}>NO SHARED CORES WITH OTHER KEYWORDS</span>
                )}
                {related.map(r => (
                  <button key={r.id} onClick={() => setSelected(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
                    <span style={{ flex: 1, fontSize: '0.68rem', color: 'rgba(0,255,204,0.65)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.id}
                    </span>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '1px', flexShrink: 0 }}>
                      {r.weight} SHARED
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}