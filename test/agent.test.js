import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.QLOO_MOCK = '1';
delete process.env.LLM_BASE_URL;
const { runAgent, normalize } = await import('../src/agent.js');
const { handle } = await import('../src/mcp.js');
const { qlooGet } = await import('../src/qloo.js');

const input = { home_city: 'Amman', new_city: 'Salt Lake City', favorites: [{ kind: 'artist', name: 'Fairuz' }, { kind: 'place', name: 'Habibah' }] };

test('normalize validates input', () => {
  assert.throws(() => normalize({ favorites: [] }), /new_city/);
  assert.throws(() => normalize({ new_city: 'X', favorites: [] }), /favorite/);
  assert.equal(normalize({ ...input, lang: 'ar' }).lang, 'ar');
});

test('planner builds an explainable 7-day plan', async () => {
  const out = await runAgent(input);
  assert.equal(out.plan.days.length, 7);
  const first = out.plan.days[0].items[0];
  assert.match(first.why, /Fairuz/);
  assert.ok(out.trace.some((s) => s.name === 'places_like_home'));
});

test('Arabic plan is RTL', async () => {
  const out = await runAgent({ ...input, lang: 'ar' });
  assert.equal(out.plan.dir, 'rtl');
  assert.match(out.plan.title, /أسبوعك/);
});

test('place insights use filter.location.query, media use signal.location.query', async () => {
  const urls = [];
  const orig = globalThis.fetch;
  process.env.QLOO_MOCK = '0'; process.env.QLOO_API_KEY = 'test';
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ results: { entities: [] } }), { status: 200 }); };
  try {
    const { insights } = await import('../src/qloo.js');
    await insights({ type: 'place', entityIds: ['a'], locationQuery: 'Denver' });
    await insights({ type: 'artist', entityIds: ['a'], locationQuery: 'Denver' });
  } finally { globalThis.fetch = orig; process.env.QLOO_MOCK = '1'; delete process.env.QLOO_API_KEY; }
  assert.match(urls[0], /hackathon\.api\.qloo\.com\/v2\/insights\?.*filter\.location\.query=Denver/);
  assert.match(urls[1], /signal\.location\.query=Denver/);
});

test('MCP lists and calls tools', async () => {
  const list = await handle({ id: 1, method: 'tools/list' });
  assert.ok(list.result.tools.find((t) => t.name === 'first_week_plan'));
  const r = await handle({ id: 2, method: 'tools/call', params: { name: 'first_week_plan', arguments: input } });
  assert.ok(JSON.parse(r.result.content[0].text).days.length > 0);
});

test('qlooGet caches', async () => {
  const a = await qlooGet('/search', { query: 'x' }); const b = await qlooGet('/search', { query: 'x' });
  assert.equal(a, b);
});

test('heatmap areas: harness request shape, distinct areas', async () => {
  const urls = [];
  const orig = globalThis.fetch;
  process.env.QLOO_MOCK = '0'; process.env.QLOO_API_KEY = 'test';
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ results: { heatmap: [] } }), { status: 200 }); };
  try { const { heatmap } = await import('../src/qloo.js'); await heatmap({ entityIds: ['a'], locationQuery: 'Provo' }); }
  finally { globalThis.fetch = orig; process.env.QLOO_MOCK = '1'; delete process.env.QLOO_API_KEY; }
  assert.match(urls[0], /filter\.type=urn%3Aheatmap/);
  assert.match(urls[0], /filter\.location\.query=Provo/);
  const out = await runAgent(input);
  assert.equal(out.areas.length, 3); // 4 mock points, two share a 5-char geohash
  assert.equal(out.plan.areas.length, 3);
  assert.match(out.plan.areas[0].map, /openstreetmap/);
});

test('tags use semantic search like the official harness', async () => {
  const urls = [];
  const orig = globalThis.fetch;
  process.env.QLOO_MOCK = '0'; process.env.QLOO_API_KEY = 'test';
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ results: { tags: [] } }), { status: 200 }); };
  try { const { searchTags } = await import('../src/qloo.js'); await searchTags('knafeh'); }
  finally { globalThis.fetch = orig; process.env.QLOO_MOCK = '1'; delete process.env.QLOO_API_KEY; }
  assert.match(urls[0], /\/v2\/tags\?filter\.query=knafeh&feature\.semantic_search=true/);
});
