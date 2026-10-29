import React, { useState, useEffect, useMemo, useRef } from 'react';

const VB_W = 900;
const VB_H = 600;

export default function KeywordGraphCanvas({ nodes, links, cores, selected, onSelect }) {
  const [pos, setPos] = useState({});
  const [dragId, setDragId] = useState(null);
  const svgRef = useRef(null);
  const movedRef = useRef(false);

  useEffect(() => {
    const next = {};
    nodes.forEach(n => { next[n.id] = { x: n.x, y: n.y }; });
    setPos(next);
  }, [nodes]);

  const neighbors = useMemo(() => {
    if (!selected) return null;
    const set = new Set([selected]);
    links.forEach(l => {
      if (l.source === selected) set.add(l.target);
      if (l.target === selected) set.add(l.source);
    });
    return set;
  }, [links, selected]);

  const maxDegree = useMemo(() => Math.max(1, ...nodes.map(n => n.degree)), [nodes]);

  const colorOf = (coreIds) => cores[coreIds?.[0]]?.color || '#00ffcc';

  const toSvg = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VB_W,
      y: ((e.clientY - rect.top) / rect.height) * VB_H,
    };
  };

  const handleMove = (e) => {
    if (!dragId) return;
    const p = toSvg(e);
    setPos(prev => ({ ...prev, [dragId]: p }));
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', userSelect: 'none' }}
      onPointerMove={handleMove}
      onPointerUp={() => setDragId(null)}
      onPointerLeave={() => setDragId(null)}
    >
      {links.map((l, i) => {
        const a = pos[l.source];
        const b = pos[l.target];
        if (!a || !b) return null;
        const active = selected && (l.source === selected || l.target === selected);
        const dim = selected && !active;
        return (
          <line
            key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={active ? '#00ffcc' : 'rgba(0,255,204,0.3)'}
            strokeWidth={active ? 1 + Math.min(2.5, l.weight) : 0.5 + Math.min(1.5, l.weight * 0.5)}
            opacity={dim ? 0.1 : active ? 0.95 : 0.45}
          />
        );
      })}

      {nodes.map(n => {
        const p = pos[n.id];
        if (!p) return null;
        const isSelected = selected === n.id;
        const isNeighbor = !!neighbors?.has(n.id);
        const dim = selected && !isNeighbor;
        const r = 3.5 + Math.sqrt(Math.max(n.degree, 1) / maxDegree) * 9;
        const color = colorOf(n.cores);
        const showLabel = selected ? (isSelected || isNeighbor) : (nodes.length <= 60 || n.degree >= 4);
        return (
          <g
            key={n.id}
            transform={`translate(${p.x},${p.y})`}
            opacity={dim ? 0.15 : 1}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.preventDefault();
              movedRef.current = false;
              setDragId(n.id);
              if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={() => { if (dragId === n.id) movedRef.current = true; }}
            onClick={() => { if (!movedRef.current) onSelect?.(isSelected ? '' : n.id); }}
          >
            {isSelected && <circle r={r + 6} fill="none" stroke={color} strokeWidth={1} opacity={0.65} />}
            <circle r={r} fill={color} fillOpacity={isSelected ? 0.9 : 0.5} stroke={color} strokeWidth={isSelected ? 1.6 : 0.8} />
            {showLabel && (
              <text
                x={r + 4} y={3.5}
                style={{
                  fontSize: 8.5, fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.5px',
                  fill: isSelected ? '#ffffff' : 'rgba(0,255,204,0.7)',
                  pointerEvents: 'none', textTransform: 'uppercase',
                }}
              >
                {n.id.length > 26 ? `${n.id.slice(0, 25)}…` : n.id}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}