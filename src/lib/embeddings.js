// One place that turns text into a vector, OpenAI-style only:
// POST {base}/v1/embeddings  { model, input }  ->  { data: [{ embedding: [...] }] }
// The base URL is named in every error, so a server answering on the wrong route
// (an Elasticsearch node instead of the model host) is obvious at a glance.
const trimSlash = (url) => String(url || '').replace(/\/+$/, '');

const reasonOf = (json) => {
  const e = json?.error;
  const r = e?.root_cause?.[0]?.reason || e?.reason || e?.message || (typeof e === 'string' ? e : '') || json?.message || '';
  return String(r || '').slice(0, 300);
};

export async function embedText(url, model, text) {
  const base = trimSlash(url) || '/proxy';
  const route = `${base}/v1/embeddings`;

  let res;
  try {
    res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });
  } catch (e) {
    throw new Error(`Embedding request to ${route} failed — ${e.message}`);
  }

  let json = null;
  try { json = await res.json(); } catch {}

  if (!res.ok) {
    const reason = reasonOf(json);
    throw new Error(`Embedding HTTP ${res.status} at ${route}${reason ? ` — ${reason}` : ''}`);
  }

  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error(`No vector in the response from ${route} — expected { data: [{ embedding: [...] }] }`);
  }
  return vec;
}