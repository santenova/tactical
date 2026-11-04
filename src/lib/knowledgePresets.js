import { safeSetItem } from '@/lib/safeStorage';

export const PRESET_LS_KEY = 'tactical_core_presets';

export const PRESET_COLORS = [
  '#00ffcc', '#7eb8ff', '#bb88ff', '#ffcc66',
  '#00e5ff', '#ff6b6b', '#f0abfc', '#ff9500',
  '#00cc66', '#66d9e8', '#c0ff6b', '#ff8fb1',
  '#8effd0', '#d4a5ff',
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
  { name: 'data_science', label: '⬚ DATA SCIENCE', color: '#7eb8ff', queries: ['applied statistics', 'data visualisation', 'feature engineering', 'model evaluation', 'sql analytics'] },
  { name: 'finance', label: '₿ FINANCE', color: '#ffcc66', queries: ['portfolio theory', 'derivatives pricing', 'risk management', 'corporate valuation', 'personal finance'] },
  { name: 'trading', label: '⇅ TRADING', color: '#00cc66', queries: ['technical analysis', 'order book dynamics', 'market microstructure', 'algorithmic trading', 'position sizing'] },
  { name: 'business', label: '◫ BUSINESS', color: '#bb88ff', queries: ['business models', 'operations management', 'strategy frameworks', 'startup growth', 'negotiation tactics'] },
  { name: 'marketing', label: '◈ MARKETING', color: '#ff8fb1', queries: ['brand strategy', 'search engine optimisation', 'content marketing', 'conversion optimisation', 'market research'] },
  { name: 'devops', label: '⚙ DEVOPS', color: '#00e5ff', queries: ['container orchestration', 'ci cd pipelines', 'observability', 'infrastructure as code', 'site reliability'] },
  { name: 'robotics', label: '⌬ ROBOTICS', color: '#66d9e8', queries: ['robot kinematics', 'control theory', 'computer vision', 'sensor fusion', 'motion planning'] },
  { name: 'electronics', label: '⌁ ELECTRONICS', color: '#c0ff6b', queries: ['circuit analysis', 'microcontrollers', 'signal processing', 'pcb design', 'power electronics'] },
  { name: 'ai_safety', label: '◉ AI SYSTEMS', color: '#d4a5ff', queries: ['prompt engineering', 'retrieval augmented generation', 'model alignment', 'agent architectures', 'evaluation benchmarks'] },
  { name: 'geology', label: '⛰ GEOLOGY', color: '#ff9500', queries: ['plate tectonics', 'mineralogy', 'volcanology', 'sedimentology', 'palaeontology'] },
  { name: 'climate', label: '☀ CLIMATE', color: '#00ffcc', queries: ['climate modelling', 'carbon cycle', 'renewable energy', 'adaptation policy', 'emissions accounting'] },
  { name: 'nutrition', label: '❋ NUTRITION', color: '#8effd0', queries: ['macronutrients', 'metabolism', 'dietary guidelines', 'sports nutrition', 'food science'] },
  { name: 'fitness', label: '◬ FITNESS', color: '#ff6b6b', queries: ['strength training', 'mobility work', 'endurance training', 'recovery protocols', 'programme design'] },
  { name: 'sports', label: '⚡ SPORTS', color: '#66d9e8', queries: ['sports physiology', 'training periodisation', 'biomechanics', 'sports psychology', 'injury prevention'] },
  { name: 'military', label: '⛊ DEFENSE', color: '#c0ff6b', queries: ['military strategy', 'threat intelligence', 'logistics planning', 'signals intelligence', 'operational doctrine'] },
  { name: 'aviation', label: '✈ AVIATION', color: '#7eb8ff', queries: ['aerodynamics', 'flight instruments', 'air traffic control', 'aircraft systems', 'aviation meteorology'] },
  { name: 'maritime', label: '⚓ MARITIME', color: '#00e5ff', queries: ['marine navigation', 'naval architecture', 'maritime law', 'port operations', 'marine meteorology'] },
  { name: 'photography', label: '◐ PHOTOGRAPHY', color: '#ffcc66', queries: ['exposure triangle', 'lighting setups', 'composition rules', 'post processing', 'lens optics'] },
  { name: 'film', label: '▶ FILM', color: '#f0abfc', queries: ['cinematography', 'screenwriting', 'film editing', 'sound design', 'film history'] },
  { name: 'gaming', label: '◉ GAMING', color: '#bb88ff', queries: ['game design', 'level design', 'game engines', 'player psychology', 'procedural generation'] },
  { name: 'culinary', label: '◍ CULINARY', color: '#ff9500', queries: ['culinary techniques', 'flavour pairing', 'baking science', 'knife skills', 'menu design'] },
  { name: 'education', label: '✎ PEDAGOGY', color: '#00cc66', queries: ['learning theory', 'curriculum design', 'assessment methods', 'instructional design', 'classroom management'] },
  { name: 'sociology', label: '⚭ SOCIOLOGY', color: '#ff8fb1', queries: ['social theory', 'urban sociology', 'social inequality', 'cultural studies', 'research methods'] },
  { name: 'archaeology', label: '⛏ ARCHAEOLOGY', color: '#d4a5ff', queries: ['excavation methods', 'dating techniques', 'ancient artefacts', 'stratigraphy', 'cultural heritage'] },
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
  safeSetItem(PRESET_LS_KEY, JSON.stringify(presets));
}

export function slugifyPresetName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}