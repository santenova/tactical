import { ELASTIC_PROXY_URL } from '@/lib/localProxies';

export const ES_LS_KEY = 'tactical_es_endpoints';
export const ES_ACTIVE_LS_KEY = 'tactical_es_active_ep';

const DEFAULTS = [
  { url: ELASTIC_PROXY_URL, label: 'Proxy' },
  { url: 'http://localhost:9200', label: 'Local' },
];

export function loadEsEndpoints() {
  let eps = null;
  try {
    eps = JSON.parse(localStorage.getItem(ES_LS_KEY));
  } catch {
    eps = null;
  }
  if (!Array.isArray(eps) || eps.length === 0) return DEFAULTS;
  // Make sure the same-origin proxy is always offered, even for older installs
  if (!eps.some(e => e?.url === ELASTIC_PROXY_URL)) {
    return [{ url: ELASTIC_PROXY_URL, label: 'Proxy' }, ...eps];
  }
  return eps;
}

export function saveEsEndpoints(eps) {
  localStorage.setItem(ES_LS_KEY, JSON.stringify(eps));
}

export function saveActiveEsEndpoint(index) {
  localStorage.setItem(ES_ACTIVE_LS_KEY, String(index));
}

// Put the endpoint the boot diagnostics actually reached first, without dropping any others.
export function preferElasticEndpoint(url) {
  const eps = loadEsEndpoints();
  const match = eps.find(e => e?.url === url);
  if (!match || eps[0] === match) return;
  saveEsEndpoints([match, ...eps.filter(e => e !== match)]);
}