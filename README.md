<div align="center">

# Jisr · جسر

**An agent that helps newcomers feel at home in a new city — grounded in [Qloo](https://qloo.com)'s taste graph, not LLM guesses.**

### Live demo → [jisr-qloo.onrender.com](https://jisr-qloo.onrender.com)

`Qloo Insights` · `Entity Search` · `Tags` · `Explainability` · `Heatmaps` · `Agent tool loop` · `MCP server` · `English + Arabic (RTL)`

</div>

## Problem → Qloo Taste API → explainable plan

| Step | What happens | Qloo surface |
|------|----------------|--------------|
| 1. Tell Jisr what you love back home | singer, bakery, film, show… | — |
| 2. Resolve favorites | map names → real entities | `/search` |
| 3. Find places in the **new** city | cross-city, cross-domain affinity | `/v2/insights` + `filter.location` (+ optional `/v2/tags`) |
| 4. Culture bridge | artists & films locals with your taste love | `/v2/insights` + `signal.location` |
| 5. Neighborhoods | where that taste clusters | `/v2/insights` `urn:heatmap` |
| 6. First-week plan | every pick cites the home favorite that drove it | `feature.explainability` → *"because you love Fairuz & Habibah"* |

**Why Qloo (not a plain LLM):** "places in Salt Lake City that people who love *this Amman bakery* also love" is a taste-graph query. An LLM alone invents; Qloo's graph returns ranked entities with explainability scores the agent is allowed to cite.

Try the live demo with the defaults (Amman → Salt Lake City, Fairuz + Habibah Sweets). Health at `/api/health` should show `"mock": false` when the Render `QLOO_API_KEY` is set.

## Agent design

```
favorites → resolve_favorites → places_like_home → culture_bridge(artist)
         → culture_bridge(movie|tv) → neighborhoods_like_home → compose plan
           (/search)          (/v2/insights)      (/v2/insights)     (explainability → "because…")
```

- **Two brains, one tool set.** With `LLM_BASE_URL` / `LLM_API_KEY`, any OpenAI-compatible model drives tools by function calling. Without an LLM, a deterministic planner runs the same tools so the demo never breaks.
- **MCP server** (`npm run mcp`): same tools + `first_week_plan` for Claude Desktop, Cursor, etc.
- **Streaming trace:** the UI shows each tool call live so judges can watch the agent work.
- **Harness-shaped requests:** calls mirror `@qloo/qloo-harness` workflows. `scripts/live_check.mjs` checks shapes against the live hackathon API (prints shapes only, never Qloo payloads).
- **Zero dependencies:** pure Node 20 (`http`, `fetch`, `node:test`). No `npm install` needed.
- Private in-memory cache only; no Qloo data is committed (test fixtures are synthetic placeholders).

## Run locally

```bash
git clone https://github.com/barood-labs/jisr-qloo.git && cd jisr-qloo
cp .env.example .env    # set QLOO_API_KEY (hackathon key → https://hackathon.api.qloo.com)
export $(grep -v '^#' .env | xargs)
npm start               # http://localhost:8787
npm test                # offline tests (synthetic data), Node 20+
node scripts/live_check.mjs "Salt Lake City"   # needs QLOO_API_KEY
npm run mcp             # MCP over stdio
```

MCP client snippet:

```json
{ "mcpServers": { "jisr": { "command": "node", "args": ["/path/to/jisr-qloo/src/mcp.js"], "env": { "QLOO_API_KEY": "…" } } } }
```

**Deploy:** live service is on Render (`render.yaml`). Or use the `Dockerfile`. Keep `QLOO_API_KEY` in the host env — never commit it.

## API

- `GET /api/health` → `{ "ok": true, "mock": false, "llm": false }` when live Qloo is configured.
- `POST /api/plan` with:

```json
{
  "home_city": "Amman",
  "new_city": "Salt Lake City",
  "lang": "en",
  "need": "lebanese bakery",
  "favorites": [{ "kind": "artist", "name": "Fairuz" }]
}
```

Returns NDJSON: `{"step":…}` while the agent works, then `{"final":{"plan":…,"mock":false}}`.

## Limitations

- Affinities describe what *groups* with similar taste tend to like, not what one person will do. Jisr says "people who love X also love Y", never a personal prediction.
- Heatmap areas are taste clusters, not housing / safety / price advice. If the hackathon heatmap is empty for a city, the 7-day place + culture plan still runs.
- Only public favorite names and city names are sent to Qloo. Nothing is stored server-side beyond a short in-memory cache.

## Links

- **Live demo:** https://jisr-qloo.onrender.com
- **Repo:** https://github.com/barood-labs/jisr-qloo
- **Devpost:** https://devpost.com/software/jisr-2l45p0

## License

MIT
