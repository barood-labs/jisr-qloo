// Minimal Qloo client (zero dependencies, Node >= 20).
// Hackathon keys only work against https://hackathon.api.qloo.com and the X-Api-Key header.
import { mockFetch } from './mock.js';

export const QLOO_BASE = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';

export const TYPES = {
  place: 'urn:entity:place',
  artist: 'urn:entity:artist',
  movie: 'urn:entity:movie',
  tv_show: 'urn:entity:tv_show',
  book: 'urn:entity:book',
  podcast: 'urn:entity:podcast',
  brand: 'urn:entity:brand',
  destination: 'urn:entity:destination',
};

const cache = new Map(); // private, in-memory only (never written to the repo)

export function isMock() {
  return process.env.QLOO_MOCK === '1' || !process.env.QLOO_API_KEY;
}

export async function qlooGet(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const url = `${QLOO_BASE}${path}?${qs}`;
  if (cache.has(url)) return cache.get(url);
  let data;
  if (isMock()) {
    data = mockFetch(path, Object.fromEntries(qs));
  } else {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': process.env.QLOO_API_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Qloo ${res.status} on ${path}: ${text.slice(0, 300)}`);
    data = JSON.parse(text);
  }
  cache.set(url, data);
  return data;
}

// /search -> entity IDs by name
export async function searchEntities(query, type, take = 3) {
  const data = await qlooGet('/search', { query, types: type ? TYPES[type] || type : undefined, take });
  return (data.results || []).map(slim);
}

// /v2/tags -> valid tag IDs by keyword
export async function searchTags(query, take = 5) {
  // Same request shape as the official @qloo/qloo-harness find_tags workflow.
  const data = await qlooGet('/v2/tags', { 'filter.query': query, 'feature.semantic_search': true, take });
  const tags = data.results?.tags || data.results || [];
  return tags.map((t) => ({ id: t.id || t.tag_id, name: t.name, type: t.type || t.subtype }));
}

// /v2/insights -> ranked entities with explainability
export async function insights({ type, entityIds = [], tagIds = [], locationQuery, take = 8, extra = {} }) {
  const params = {
    'filter.type': TYPES[type] || type,
    'signal.interests.entities': entityIds.length ? entityIds : undefined,
    'signal.interests.tags': tagIds.length ? tagIds : undefined,
    take,
    'feature.explainability': true,
    ...extra,
  };
  if (locationQuery && (type === 'place' || type === 'destination')) params['filter.location.query'] = locationQuery;
  else if (locationQuery) params['signal.location.query'] = locationQuery;
  const data = await qlooGet('/v2/insights', params);
  const ents = data.results?.entities || (Array.isArray(data.results) ? data.results : []);
  const top = data.query?.explainability; // some responses carry explainability at the query level
  return ents.map((e) => ({ ...slim(e), explain: explainOf(e, top) }));
}

// /v2/insights with filter.type=urn:heatmap -> where in a city this taste clusters.
// Same request shape as the official harness where_popular workflow.
export async function heatmap({ entityIds = [], locationQuery, take = 30 }) {
  const data = await qlooGet('/v2/insights', {
    'filter.type': 'urn:heatmap',
    'signal.interests.entities': entityIds.length ? entityIds : undefined,
    'filter.location.query': locationQuery,
    take,
  });
  const pts = data.results?.heatmap || (Array.isArray(data.results) ? data.results : []);
  return pts
    .map((p) => ({
      lat: p.location?.latitude ?? p.latitude,
      lon: p.location?.longitude ?? p.longitude,
      geohash: p.location?.geohash ?? p.geohash,
      affinity: p.query?.affinity ?? p.affinity,
      popularity: p.query?.popularity ?? p.popularity,
    }))
    .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
    .sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1));
}

function slim(e) {
  return {
    id: e.entity_id || e.id,
    name: e.name,
    type: e.subtype || e.type,
    affinity: e.query?.affinity ?? e.affinity,
    address: e.properties?.address,
    city: e.properties?.geocode?.city || e.properties?.geocode?.name,
    tags: (e.tags || []).slice(0, 4).map((t) => t.name),
    url: e.properties?.website || undefined,
  };
}

function explainOf(e, top) {
  let ex = e.query?.explainability;
  if (!ex && top && typeof top === 'object') ex = top[e.entity_id] || top[e.id];
  if (!ex) return [];
  const list = ex['signal.interests.entities'] || ex.signal || [];
  return (Array.isArray(list) ? list : [])
    .map((x) => ({ id: x.entity_id || x.id, score: x.score }))
    .filter((x) => x.id)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}
