// Same-origin reverse proxies registered on the app's own host, so requests to
// Ollama and Elasticsearch never leave the origin and CORS never applies.
export const OLLAMA_PROXY_URL = '/proxy';
export const ELASTIC_PROXY_URL = '/db';

// Used when the internal proxies aren't reachable from the host serving the app.
export const DIRECT_OLLAMA_URL = 'http://localhost:11434';
export const DIRECT_ELASTIC_URL = 'http://localhost:9200';

const LEGACY_OLLAMA_URLS = ['http://localhost:11434', 'http://127.0.0.1:11434', 'http://0.0.0.0:11434'];

const trimSlash = (url) => String(url).replace(/\/+$/, '');

// Installs saved before the proxies existed point straight at localhost — send them via /proxy.
export function normalizeOllamaUrl(url) {
  if (!url) return OLLAMA_PROXY_URL;
  return LEGACY_OLLAMA_URLS.includes(trimSlash(url)) ? OLLAMA_PROXY_URL : url;
}

// A reachable proxy answers with the service's own JSON — a catch-all page rewrite does not.
async function probe(url, validate) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    return validate(await res.json());
  } catch {
    return false;
  }
}

let resolution = null;

// Internal proxies when the local network answers, direct local ports otherwise.
// Cached so the boot sequence reuses what the diagnostics already found; pass
// force to probe again (the diagnostics recheck does).
export function resolveLocalEndpoints(force = false) {
  if (!resolution || force) {
    resolution = (async () => {
      const [ollama, elastic] = await Promise.all([
        probe(`${OLLAMA_PROXY_URL}/v1/models`, json => Array.isArray(json?.data)),
        probe(`${ELASTIC_PROXY_URL}/`, json => Boolean(json?.version?.number)),
      ]);
      return {
        ollama: ollama ? OLLAMA_PROXY_URL : DIRECT_OLLAMA_URL,
        elastic: elastic ? ELASTIC_PROXY_URL : DIRECT_ELASTIC_URL,
      };
    })();
  }
  return resolution;
}