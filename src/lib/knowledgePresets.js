export const PRESET_LS_KEY = 'tactical_core_presets';

export const PRESET_COLORS = [
  '#00ffcc', '#7eb8ff', '#bb88ff', '#ffcc66',
  '#00e5ff', '#ff6b6b', '#f0abfc', '#ff9500',
  '#00cc66', '#66d9e8',
];

export const DEFAULT_PRESETS = [
  { name: 'science', label: '⬡ SCIENCE', color: '#00ffcc', queries: ['physics fundamentals', 'chemistry reactions', 'biology cells', 'scientific method', 'quantum mechanics'] },
  { name: 'geometry', label: '△ GEOMETRY', color: '#7eb8ff', queries: ['euclidean geometry', 'trigonometry', 'coordinate geometry', 'geometric proofs', 'polygons properties'] },
  { name: 'mathematics', label: '∑ MATH', color: '#bb88ff', queries: ['calculus', 'linear algebra', 'probability theory', 'number theory', 'differential equations'] },
  { name: 'history', label: '⌖ HISTORY', color: '#ffcc66', queries: ['ancient civilizations', 'world wars', 'industrial revolution', 'cold war', 'renaissance'] },
  { name: 'technology', label: '⌬ TECH', color: '#00e5ff', queries: ['machine learning', 'distributed systems', 'cryptography', 'cloud computing', 'software architecture'] },
  { name: 'medicine', label: '✚ MEDICINE', color: '#ff6b6b', queries: ['anatomy', 'pharmacology', 'pathology', 'clinical diagnosis', 'epidemiology'] },
  { name: 'literature', label: '✎ LITERATURE', color: '#f0abfc', queries: ['literary analysis', 'poetry forms', 'narrative structure', 'classical novels', 'rhetoric'] },
  { name: 'philosophy', label: '☉ PHILOSOPHY', color: '#ff9500', queries: ['ethics', 'epistemology', 'metaphysics', 'existentialism', 'logic'] },
  { name: 'engineering', label: '⚙ ENGINEERING', color: '#00cc66', queries: ['structural engineering', 'thermodynamics', 'fluid mechanics', 'materials science', 'control systems'] },
  { name: 'astronomy', label: '✦ ASTRONOMY', color: '#66d9e8', queries: ['solar system', 'stellar evolution', 'galaxies', 'cosmology', 'telescope observations'] },
  { name: 'economics', label: '⇅ ECONOMICS', color: '#ffcc66', queries: ['microeconomics', 'macroeconomics', 'monetary policy', 'supply and demand', 'behavioural economics'] },
  { name: 'law', label: '⚖ LAW', color: '#7eb8ff', queries: ['constitutional law', 'contract law', 'criminal procedure', 'international law', 'legal precedent'] },
  { name: 'psychology', label: 'Ψ PSYCHOLOGY', color: '#bb88ff', queries: ['cognitive psychology', 'behavioural therapy', 'developmental psychology', 'neuroscience', 'personality theory'] },
  { name: 'linguistics', label: '⌘ LINGUISTICS', color: '#f0abfc', queries: ['phonetics', 'syntax', 'semantics', 'sociolinguistics', 'language acquisition'] },
  { name: 'art', label: '◨ ART', color: '#ff9500', queries: ['art history', 'renaissance painting', 'modernism', 'sculpture techniques', 'colour theory'] },
  { name: 'music', label: '♪ MUSIC', color: '#00e5ff', queries: ['music theory', 'harmony and counterpoint', 'orchestration', 'jazz improvisation', 'music history'] },
  { name: 'geography', label: '⌖ GEOGRAPHY', color: '#00ffcc', queries: ['physical geography', 'climate zones', 'cartography', 'urban geography', 'ocean currents'] },
  { name: 'cybersecurity', label: '⛨ CYBERSECURITY', color: '#ff6b6b', queries: ['threat modelling', 'penetration testing', 'malware analysis', 'incident response', 'network security'] },
  { name: 'agriculture', label: '⚘ AGRICULTURE', color: '#00cc66', queries: ['soil science', 'crop rotation', 'irrigation systems', 'plant pathology', 'sustainable farming'] },
  { name: 'architecture', label: '⬔ ARCHITECTURE', color: '#66d9e8', queries: ['building design', 'urban planning', 'architectural styles', 'building materials', 'sustainable design'] },
];

export function loadPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESET_LS_KEY));
    if (!Array.isArray(saved)) return DEFAULT_PRESETS;
    // Preset bank additions surface for installs that already saved a preset list
    const known = new Set(saved.map(p => p.name));
    return [...saved, ...DEFAULT_PRESETS.filter(p => !known.has(p.name))];
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresets(presets) {
  localStorage.setItem(PRESET_LS_KEY, JSON.stringify(presets));
}

export function slugifyPresetName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}