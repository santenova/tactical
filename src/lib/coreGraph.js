import { PRESET_COLORS } from './knowledgePresets';
import { loadEsEndpoints, ES_ACTIVE_LS_KEY } from './esEndpoints';

// Stable accent colour per core name
export function colorForCore(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PRESET_COLORS[h % PRESET_COLORS.length];
}

const cleanKeywords = (list) => [...new Set((list || []).map(k => String(k).trim().toLowerCase()).filter(Boolean))];

// Keywords become nodes; every pair sharing a core becomes a weighted link
export function buildGraph(cores, { maxNodes = 140 } = {}) {
  const keywordCores = new Map();
  cores.forEach(c => {
    cleanKeywords(c.keywords).forEach(k => {
      if (!keywordCores.has(k)) keywordCores.set(k, new Set());
      keywordCores.get(k).add(c.id);
    });
  });

  let nodes = [...keywordCores.entries()].map(([id, set]) => ({ id, cores: [...set], x: 0, y: 0, degree: 0 }));
  nodes.sort((a, b) => b.cores.length - a.cores.length || a.id.localeCompare(b.id));
  if (nodes.length > maxNodes) nodes = nodes.slice(0, maxNodes);
  const keep = new Set(nodes.map(n => n.id));

  const pairKey = (a, b) => (a < b ? `${a}||${b}` : `${b}||${a}`);
  const linkMap = new Map();
  cores.forEach(c => {
    const kws = cleanKeywords(c.keywords).filter(k => keep.has(k));
    for (let i = 0; i < kws.length; i++) {
      for (let j = i + 1; j < kws.length; j++) {
        const key = pairKey(kws[i], kws[j]);
        const ex = linkMap.get(key);
        if (ex) {
          ex.weight += 1;
          if (!ex.cores.includes(c.id)) ex.cores.push(c.id);
        } else {
          linkMap.set(key, { source: kws[i], target: kws[j], weight: 1, cores: [c.id] });
        }
      }
    }
  });

  const links = [...linkMap.values()];
  const degree = new Map();
  links.forEach(l => {
    degree.set(l.source, (degree.get(l.source) || 0) + l.weight);
    degree.set(l.target, (degree.get(l.target) || 0) + l.weight);
  });
  nodes = nodes.map(n => ({ ...n, degree: degree.get(n.id) || 0 }));

  return { nodes, links, keywordCount: keywordCores.size, coreCount: cores.length };
}

// Deterministic force-directed layout (Fruchterman-Reingold style), then fit to the viewport
export function computeLayout(nodes, links, { width = 900, height = 600, iterations = 350 } = {}) {
  const n = nodes.length;
  if (n === 0) return nodes;

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const k = Math.sqrt((width * height) / n) * 0.8;

  nodes.forEach((node, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = Math.min(width, height) * 0.36;
    xs[i] = width / 2 + Math.cos(a) * r;
    ys[i] = height / 2 + Math.sin(a) * r;
  });

  const edgeList = links
    .map(l => [index.get(l.source), index.get(l.target), Math.min(3, l.weight)])
    .filter(([a, b]) => a != null && b != null);

  let temp = width / 8;

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j];
        let dy = ys[i] - ys[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = 0.1; dy = 0.1; d2 = 0.02; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        const ux = dx / d;
        const uy = dy / d;
        vx[i] += ux * f; vy[i] += uy * f;
        vx[j] -= ux * f; vy[j] -= uy * f;
      }
    }

    for (const [a, b, w] of edgeList) {
      const dx = xs[a] - xs[b];
      const dy = ys[a] - ys[b];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = ((d * d) / k) * (0.5 + w * 0.2);
      const ux = dx / d;
      const uy = dy / d;
      vx[a] -= ux * f; vy[a] -= uy * f;
      vx[b] += ux * f; vy[b] += uy * f;
    }

    for (let i = 0; i < n; i++) {
      vx[i] += (width / 2 - xs[i]) * 0.03;
      vy[i] += (height / 2 - ys[i]) * 0.03;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) || 1;
      const step = Math.min(sp, temp);
      xs[i] += (vx[i] / sp) * step;
      ys[i] += (vy[i] / sp) * step;
      vx[i] = 0;
      vy[i] = 0;
    }
    temp = Math.max(0.6, temp * 0.985);
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
  }
  const pad = 42;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offX = pad + ((width - pad * 2) - spanX * scale) / 2;
  const offY = pad + ((height - pad * 2) - spanY * scale) / 2;

  return nodes.map((node, i) => ({
    ...node,
    x: offX + (xs[i] - minX) * scale,
    y: offY + (ys[i] - minY) * scale,
  }));
}

// Personal cores saved in Elasticsearch: <preset>_core_<user id>
export async function fetchPersonalCores() {
  const endpoints = loadEsEndpoints();
  const saved = parseInt(localStorage.getItem(ES_ACTIVE_LS_KEY) || '0', 10);
  const active = Math.min(Number.isNaN(saved) ? 0 : saved, Math.max(0, endpoints.length - 1));
  const url = endpoints[active]?.url;
  if (!url) return { cores: [], url: '' };

  const res = await fetch(`${url}/_cat/indices?format=json&h=index`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const names = (json || [])
    .map(i => i.index)
    .filter(name => /_core_/.test(name) && !name.startsWith('knowledge_core_') && !name.startsWith('.'));

  const cores = await Promise.all(names.map(async index => {
    try {
      const r = await fetch(`${url}/${index}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 300, query: { match_all: {} }, _source: ['keywords', 'preset'] }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const keywords = (j.hits?.hits || []).flatMap(h => h._source?.keywords || []);
      return { index, label: index.replace(/_core_.*$/, ''), keywords };
    } catch { return null; }
  }));

  return { cores: cores.filter(Boolean), url };
}