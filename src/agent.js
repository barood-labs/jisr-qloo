// The Jisr agent: plan -> call Qloo tools -> compose a grounded, explainable first-week plan.
// Two brains: (1) any OpenAI-compatible LLM with tool calling (LLM_BASE_URL/LLM_API_KEY/LLM_MODEL),
// (2) a deterministic planner used when no LLM is configured, so the demo always works.
import { toolDefs, runTool } from './tools.js';
import { T } from './i18n.js';

export async function runAgent(input, { onStep = () => {} } = {}) {
  const trace = [];
  const step = (s) => { trace.push(s); onStep(s); };
  const req = normalize(input);
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    try { return await llmAgent(req, step, trace); }
    catch (e) { step({ kind: 'note', text: `LLM unavailable (${e.message}); using deterministic planner.` }); }
  }
  return plannerAgent(req, step, trace);
}

export function normalize(input = {}) {
  const favorites = (input.favorites || []).filter((f) => f && f.name && f.kind).slice(0, 10);
  if (!input.new_city) throw new Error('new_city is required');
  if (!favorites.length) throw new Error('at least one favorite is required');
  return { home_city: input.home_city || '', new_city: input.new_city, favorites, need: input.need || '', lang: input.lang === 'ar' ? 'ar' : 'en' };
}

async function call(step, name, args) {
  step({ kind: 'tool', name, args });
  const result = await runTool(name, args);
  step({ kind: 'result', name, count: Array.isArray(result) ? result.length : 1 });
  return result;
}

export async function plannerAgent(req, step, trace) {
  step({ kind: 'plan', text: `Resolve ${req.favorites.length} home favorites, find places in ${req.new_city} with matching taste, then a music and screen bridge.` });
  const resolved = await call(step, 'resolve_favorites', { favorites: req.favorites, home_city: req.home_city });
  const ids = resolved.filter((r) => r.match).map((r) => r.match.id);
  const nameOf = Object.fromEntries(resolved.filter((r) => r.match).map((r) => [r.match.id, r.input.name]));
  if (!ids.length) return { req, resolved, plan: null, trace, error: 'none_resolved' };

  const tagQuery = guessTag(req.need);
  const places = await call(step, 'places_like_home', { entity_ids: ids, new_city: req.new_city, tag_query: tagQuery, take: 8 });
  const artists = await call(step, 'culture_bridge', { entity_ids: ids, new_city: req.new_city, kind: 'artist', take: 5 });
  const screen = await call(step, 'culture_bridge', { entity_ids: ids, new_city: req.new_city, kind: wantsTV(req) ? 'tv_show' : 'movie', take: 5 });
  let areas = [];
  try { areas = await call(step, 'neighborhoods_like_home', { entity_ids: ids, new_city: req.new_city, take: 3 }); }
  catch (e) { step({ kind: 'note', text: `Heatmap unavailable (${e.message}); plan continues without areas.` }); }

  const plan = compose(req, { places, artists, screen, areas, nameOf });
  step({ kind: 'done', text: 'Plan composed from Qloo results only.' });
  return { req, resolved, places, artists, screen, areas, plan, trace };
}

function guessTag(need = '') {
  const m = need.toLowerCase().match(/(lebanese|syrian|palestinian|iraqi|yemeni|egyptian|middle eastern|halal|bakery|coffee|cafe|hookah|shawarma|falafel|mandi|knafeh|kunafa)/);
  return m ? m[1] : undefined;
}
function wantsTV(req) { return req.favorites.some((f) => f.kind === 'tv_show'); }

export function compose(req, { places = [], artists = [], screen = [], areas = [], nameOf = {} }) {
  const t = T[req.lang];
  const why = (e) => {
    const top = (e.explain || []).slice(0, 2).map((x) => nameOf[x.id]).filter(Boolean);
    return top.length ? t.because(top.join(req.lang === 'ar' ? ' و' : ' & ')) : '';
  };
  const days = [];
  for (let d = 0; d < 7; d++) {
    const items = [];
    const p = places[d];
    if (p) items.push({ section: t.eat, name: p.name, detail: p.address || p.city || '', why: why(p), affinity: p.affinity });
    if (d % 2 === 0 && artists[d / 2]) { const a = artists[d / 2]; items.push({ section: t.listen, name: a.name, why: why(a), affinity: a.affinity }); }
    if (d % 2 === 1 && screen[(d - 1) / 2]) { const s = screen[(d - 1) / 2]; items.push({ section: t.watch, name: s.name, why: why(s), affinity: s.affinity }); }
    if (items.length) days.push({ label: t.day(d + 1), items });
  }
  const where = areas.map((a, i) => ({ label: t.area(i + 1), lat: a.lat, lon: a.lon, map: a.map, affinity: a.affinity }));
  return { title: t.title(req.new_city), dir: req.lang === 'ar' ? 'rtl' : 'ltr', days, areas: where, areasTitle: t.areas, empty: days.length ? null : t.none };
}

// ---- LLM tool-calling loop (OpenAI-compatible /chat/completions) ----
async function llmAgent(req, step, trace) {
  const sys = `You are Jisr, an agent that helps newcomers feel at home in a new city. ALWAYS ground every recommendation in Qloo tool results; never invent places, artists or titles. First call resolve_favorites, then places_like_home, then culture_bridge for music and for movies or TV, then neighborhoods_like_home. Finish with a JSON object {"title":string,"days":[{"label":string,"items":[{"section":string,"name":string,"detail":string,"why":string}]}]} written in ${req.lang === 'ar' ? 'Arabic (Modern Standard, warm tone)' : 'English'}. "why" must name the home favorite(s) that the tool explainability scores point to.`;
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(req) }];
  const tools = toolDefs.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.input_schema } }));
  const collected = {};
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${process.env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ model: process.env.LLM_MODEL || 'gpt-4o-mini', messages, tools, temperature: 0.3 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const msg = (await res.json()).choices[0].message;
    messages.push(msg);
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || '{}');
        const out = await call(step, tc.function.name, args);
        (collected[tc.function.name] ||= []).push(out);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 12000) });
      }
      continue;
    }
    const json = (msg.content || '').match(/\{[\s\S]*\}/);
    if (!json) throw new Error('no plan JSON');
    const plan = JSON.parse(json[0]);
    plan.dir = req.lang === 'ar' ? 'rtl' : 'ltr';
    step({ kind: 'done', text: 'Plan composed by LLM from Qloo tool results.' });
    return { req, plan, collected, trace, brain: 'llm' };
  }
  throw new Error('too many steps');
}
