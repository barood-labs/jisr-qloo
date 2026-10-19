// Agent tools. Each tool is a plain async function plus a JSON schema,
// so the same set powers the web agent, the LLM tool-calling loop and the MCP server.
import { searchEntities, searchTags, insights, heatmap } from './qloo.js';

export const toolDefs = [
  {
    name: 'resolve_favorites',
    description: 'Resolve things the user loves back home (artists, places, movies, TV shows, books) to Qloo entity IDs.',
    input_schema: {
      type: 'object',
      properties: {
        favorites: {
          type: 'array',
          items: {
            type: 'object',
            properties: { kind: { type: 'string', enum: ['artist', 'place', 'movie', 'tv_show', 'book', 'podcast', 'brand'] }, name: { type: 'string' } },
            required: ['kind', 'name'],
          },
        },
        home_city: { type: 'string', description: 'Used to disambiguate home places, e.g. "Amman".' },
      },
      required: ['favorites'],
    },
  },
  {
    name: 'places_like_home',
    description: 'Find places in the NEW city with the highest taste affinity to the user\'s home favorites, with an explanation of which favorite drove each pick.',
    input_schema: {
      type: 'object',
      properties: {
        entity_ids: { type: 'array', items: { type: 'string' } },
        new_city: { type: 'string' },
        tag_query: { type: 'string', description: 'Optional cuisine/vibe keyword, e.g. "lebanese", "bakery", "hookah lounge".' },
        take: { type: 'integer' },
      },
      required: ['entity_ids', 'new_city'],
    },
  },
  {
    name: 'culture_bridge',
    description: 'Find artists, movies or TV shows that people in the NEW city who share the user\'s taste love: a bridge between home culture and local culture.',
    input_schema: {
      type: 'object',
      properties: {
        entity_ids: { type: 'array', items: { type: 'string' } },
        new_city: { type: 'string' },
        kind: { type: 'string', enum: ['artist', 'movie', 'tv_show', 'book', 'podcast'] },
        take: { type: 'integer' },
      },
      required: ['entity_ids', 'new_city', 'kind'],
    },
  },
  {
    name: 'neighborhoods_like_home',
    description: 'Find WHERE in the new city the user\'s taste clusters (Qloo heatmap): the areas to look for an apartment, spend a weekend or meet people who like the same things.',
    input_schema: {
      type: 'object',
      properties: {
        entity_ids: { type: 'array', items: { type: 'string' } },
        new_city: { type: 'string' },
        take: { type: 'integer', description: 'Number of areas to return (default 3).' },
      },
      required: ['entity_ids', 'new_city'],
    },
  },
];

export const tools = {
  async resolve_favorites({ favorites = [], home_city }) {
    const out = [];
    for (const f of favorites.slice(0, 10)) {
      const q = f.kind === 'place' && home_city ? `${f.name} ${home_city}` : f.name;
      const hits = await searchEntities(q, f.kind, 1);
      out.push({ input: f, match: hits[0] || null });
    }
    return out;
  },

  async places_like_home({ entity_ids = [], new_city, tag_query, take = 8 }) {
    let tagIds = [];
    if (tag_query) tagIds = (await searchTags(tag_query, 1)).map((t) => t.id).filter(Boolean);
    return insights({ type: 'place', entityIds: entity_ids, locationQuery: new_city, take, extra: tagIds.length ? { 'filter.tags': tagIds.join(',') } : {} });
  },

  async neighborhoods_like_home({ entity_ids = [], new_city, take = 3 }) {
    const pts = await heatmap({ entityIds: entity_ids, locationQuery: new_city, take: 40 });
    // Merge neighbouring cells (same 5-char geohash, roughly 5 km) so we return distinct areas.
    const seen = new Set(); const areas = [];
    for (const p of pts) {
      const key = p.geohash ? p.geohash.slice(0, 5) : `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
      if (seen.has(key)) continue; seen.add(key);
      areas.push({ ...p, map: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=14/${p.lat}/${p.lon}` });
      if (areas.length >= take) break;
    }
    return areas;
  },

  async culture_bridge({ entity_ids = [], new_city, kind, take = 6 }) {
    return insights({ type: kind, entityIds: entity_ids, locationQuery: new_city, take });
  },
};

export async function runTool(name, args) {
  if (!tools[name]) throw new Error(`Unknown tool ${name}`);
  return tools[name](args || {});
}
