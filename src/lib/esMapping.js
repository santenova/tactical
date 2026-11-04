// Adds the dense_vector field a knowledge core needs for semantic search, in a way every
// Elasticsearch version accepts. A local cluster older than 8.7 rejects int8_hnsw outright,
// and a rejected mapping PUT leaves the core without the field — so each form is tried until
// one is stored, and the mapping is read back to confirm it.
export const EMBEDDING_DIMS = 384;

export function embeddingMapping(dims = EMBEDDING_DIMS) {
  return {
    type: 'dense_vector',
    dims,
    index: true,
    similarity: 'cosine',
    index_options: { type: 'int8_hnsw', m: 16, ef_construction: 100 },
  };
}

// Widest support last: quantized HNSW → plain HNSW → plain dense_vector
export const MAPPING_VARIANTS = (dims) => [
  { label: 'int8_hnsw', mapping: embeddingMapping(dims) },
  {
    label: 'hnsw',
    mapping: { type: 'dense_vector', dims, index: true, similarity: 'cosine', index_options: { type: 'hnsw', m: 16, ef_construction: 100 } },
  },
  { label: 'dense_vector', mapping: { type: 'dense_vector', dims, index: true, similarity: 'cosine' } },
  // Oldest clusters (7.x) take the field with no index options at all
  { label: 'dense_vector_plain', mapping: { type: 'dense_vector', dims } },
];

async function esReason(res) {
  try {
    const json = await res.json();
    return json?.error?.root_cause?.[0]?.reason || json?.error?.reason || json?.error?.type || '';
  } catch {
    return '';
  }
}

// The raw field definition, whatever type it ended up as — an index that received a
// vector before its mapping existed gets "embedding" auto-mapped as float, and that
// cannot be turned into a dense_vector afterwards
export async function readEmbeddingFieldRaw(esUrl, indexName) {
  try {
    const res = await fetch(`${esUrl}/${encodeURIComponent(indexName)}/_mapping`);
    if (!res.ok) return null;
    const json = await res.json();
    const def = json?.[indexName] || Object.values(json || {})[0];
    return def?.mappings?.properties?.embedding || null;
  } catch {
    return null;
  }
}

export async function readEmbeddingField(esUrl, indexName) {
  try {
    const res = await fetch(`${esUrl}/${encodeURIComponent(indexName)}/_mapping`);
    if (!res.ok) return null;
    const json = await res.json();
    const def = json?.[indexName] || Object.values(json || {})[0];
    const field = def?.mappings?.properties?.embedding;
    return field?.type === 'dense_vector' ? field : null;
  } catch {
    return null;
  }
}

// { existing } when the core already stores vectors, { ok, mode } when it was just added,
// { ok: false, error } with the cluster's own complaint when no form was accepted
export async function ensureEmbeddingField(esUrl, indexName, dims = EMBEDDING_DIMS) {
  const existing = await readEmbeddingField(esUrl, indexName);
  if (existing) return { ok: true, existing };

  const errors = [];
  for (const { label, mapping } of MAPPING_VARIANTS(dims)) {
    let res;
    try {
      // Only the vector field — nothing else in the request can be blamed for a refusal
      res = await fetch(`${esUrl}/${encodeURIComponent(indexName)}/_mapping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { embedding: mapping } }),
      });
    } catch (e) {
      // A blocked preflight or refused connection never reaches a status code
      errors.push(`${label}: request blocked (${e.message}) — allow PUT in the cluster's http.cors.allowed_methods`);
      continue;
    }
    if (res.ok) {
      // Confirm it actually stuck — a 200 without the field is not a success
      const stored = await readEmbeddingField(esUrl, indexName);
      if (stored) return { ok: true, mode: label, mapping: stored };
      errors.push(`${label}: field absent after update`);
      continue;
    }
    const reason = await esReason(res);
    errors.push(`${label}: HTTP ${res.status}${reason ? ` — ${reason}` : ''}`);
  }
  return { ok: false, error: errors.join(' · ') };
}