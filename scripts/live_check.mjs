// Live smoke test against the real hackathon API. Prints only response SHAPES and counts,
// never raw Qloo data, so the output is safe to paste into issues or notes.
// Usage: QLOO_API_KEY=... node scripts/live_check.mjs ["Salt Lake City"]
import { searchEntities, searchTags, insights, heatmap } from '../src/qloo.js';
import { runAgent } from '../src/agent.js';

if (!process.env.QLOO_API_KEY) { console.error('Set QLOO_API_KEY first.'); process.exit(1); }
const city = process.argv[2] || 'Salt Lake City';
const ok = (name, v) => console.log(`${v ? 'PASS' : 'FAIL'}  ${name}`);
const shape = (o) => (o && typeof o === 'object' ? Object.keys(o).join(',') : typeof o);

const a = await searchEntities('Fairuz', 'artist', 1);
ok(`/search artist -> ${a.length} hit, keys: ${shape(a[0])}`, a[0]?.id);
const t = await searchTags('lebanese', 3);
ok(`/v2/tags -> ${t.length} tags, first id prefix: ${String(t[0]?.id).split(':').slice(0, 3).join(':')}`, t[0]?.id);
const ids = a.map((x) => x.id);
const p = await insights({ type: 'place', entityIds: ids, locationQuery: city, take: 5 });
ok(`/v2/insights place -> ${p.length} results, affinity present: ${p.some((x) => x.affinity != null)}, explain present: ${p.some((x) => x.explain.length)}`, p.length);
const m = await insights({ type: 'artist', entityIds: ids, locationQuery: city, take: 5 });
ok(`/v2/insights artist (signal.location) -> ${m.length} results`, m.length);
const h = await heatmap({ entityIds: ids, locationQuery: city, take: 20 });
ok(`/v2/insights heatmap -> ${h.length} points, keys: ${shape(h[0])}`, h.length);
const out = await runAgent({ home_city: 'Amman', new_city: city, favorites: [{ kind: 'artist', name: 'Fairuz' }, { kind: 'tv_show', name: 'Bab Al-Hara' }] });
ok(`full agent -> ${out.plan?.days?.length || 0} days, ${out.plan?.areas?.length || 0} areas, why-lines: ${(out.plan?.days || []).flatMap((d) => d.items).filter((i) => i.why).length}`, out.plan?.days?.length);
