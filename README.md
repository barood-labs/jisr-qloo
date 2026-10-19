<div align="center">

# Jisr · جسر

**An agent that helps newcomers feel at home in a new city, grounded in Qloo's taste graph.**

`Qloo Insights API` · `Entity Search` · `Tags` · `Explainability` · `Heatmaps` · `Agent tool loop` · `MCP server` · `English + Arabic (RTL)`

</div>

## The problem

Every year millions of people move to a city where nothing tastes, sounds or feels familiar: students, refugees, new hires, families. Generic advice ("try the top-rated restaurants!") ignores the one thing that makes a place feel like home: **your own taste**. Ask a plain LLM and it guesses from stereotypes ("you're from Jordan, here's a falafel place").

## What Jisr does

You tell Jisr a few things you love back home: a singer, a bakery, a TV series, a film. It:

1. **Resolves** each favorite to a real Qloo entity (`/search`).
2. **Finds places in your new city** with the highest taste affinity to those favorites (`/v2/insights`, `filter.type=urn:entity:place`, `filter.location.query=<new city>`), optionally narrowed by a craving through a real Qloo tag (`/v2/tags` → `filter.tags`).
3. **Builds a culture bridge:** artists and films/shows that people *in your new city* who share your taste love (`signal.location.query`), so you connect with locals instead of living in a bubble.
4. **Explains every pick** with `feature.explainability`: "Day 3: Cafe X, *because you love Fairuz & Habibah*". The agent can only cite favorites that Qloo's explainability scores actually point to.
5. **Shows where your taste lives in the city** with a Qloo heatmap (`filter.type=urn:heatmap`): the 3 areas where people who share your taste cluster, linked to a map. That's where to look for an apartment, spend a weekend, or meet people like you.
6. Writes a **7-day "first week" plan** in English or Arabic (full RTL).

**Why it needs Qloo:** the core move, "places in Salt Lake City that people who love *this specific bakery in Amman* also love", is a cross-domain, cross-city taste query. An LLM alone cannot do that without inventing things; Qloo's graph can.

## Agent design

```
user favorites ─► resolve_favorites ─► places_like_home ─► culture_bridge(artist) ─► culture_bridge(movie|tv) ─► neighborhoods_like_home ─► compose plan
                     (/search)          (/v2/insights        (/v2/insights            (/v2/insights               (/v2/insights               (explainability
                                         + filter.location)   + signal.location)       + signal.location)          urn:heatmap)                → "because…")
```

- **Two brains, one tool set.** With `LLM_BASE_URL`/`LLM_API_KEY` set, any OpenAI-compatible model drives the tools by function calling and writes the plan (the system prompt forbids anything not returned by a tool). Without an LLM, a deterministic planner runs the same tools, so the demo never breaks.
- **MCP server** (`npm run mcp`): the same tools plus `first_week_plan` for any MCP client (Claude Desktop, Cursor and others). That is the "wire Qloo into an agent you already have" path.
- **Streaming trace:** the UI shows each tool call live, so judges can see the agent work.
- **Request shapes match Qloo's official harness.** Every call mirrors the request the official `@qloo/qloo-harness` workflows build (`find_tags` with `feature.semantic_search`, `recommend` with `feature.explainability`, `where_popular` with `urn:heatmap`). `scripts/live_check.mjs` checks all of them against the live hackathon API and prints only response shapes, never Qloo data.
- **Zero dependencies:** pure Node 20 (`http`, `fetch`, `node:test`). `npm install` is not needed.
- Private in-memory caching only; no Qloo data is committed (the test fixtures are synthetic placeholders).

## Run it

```bash
cp .env.example .env    # add QLOO_API_KEY (hackathon key, base URL https://hackathon.api.qloo.com)
export $(grep -v '^#' .env | xargs)
npm start               # http://localhost:8787
npm test                # 8 offline tests (synthetic data), Node 20 and 22
node scripts/live_check.mjs "Salt Lake City"   # live check, needs QLOO_API_KEY
npm run mcp             # MCP server over stdio
```

MCP client config:

```json
{ "mcpServers": { "jisr": { "command": "node", "args": ["/path/to/jisr/src/mcp.js"], "env": { "QLOO_API_KEY": "..." } } } }
```

Deploy: `render.yaml` (Render free web service) or the `Dockerfile` (any container host).

## API

`POST /api/plan` with `{ "home_city": "Amman", "new_city": "Salt Lake City", "lang": "en"|"ar", "need": "lebanese bakery", "favorites": [{ "kind": "artist", "name": "Fairuz" }] }`. It returns NDJSON: `{"step":…}` lines while the agent works, then `{"final":{"plan":…}}`.

## Limitations (what the results do not establish)

- Qloo affinities describe what *groups* with a similar taste tend to like, not what one person will do. Jisr presents picks as "people who love X also love Y", never as a prediction about you.
- Heatmap areas are taste clusters, not housing, safety or price advice.
- No personal data is sent to Qloo: only the names of public favorites (artists, places, titles) and city names. Nothing is stored server-side beyond a short in-memory cache.

## License

MIT
