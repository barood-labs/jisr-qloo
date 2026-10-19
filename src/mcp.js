// MCP server over stdio (JSON-RPC 2.0, newline-delimited), zero dependencies.
// Lets any existing agent (Claude Desktop, Cursor, etc.) call Jisr's Qloo-grounded tools.
import { createInterface } from 'node:readline';
import { toolDefs, runTool } from './tools.js';
import { runAgent } from './agent.js';

const allTools = [
  ...toolDefs.map((d) => ({ name: d.name, description: d.description, inputSchema: d.input_schema })),
  {
    name: 'first_week_plan',
    description: 'Full Jisr agent: given home favorites and a new city, return an explainable 7-day "feel at home" plan grounded in Qloo.',
    inputSchema: {
      type: 'object',
      properties: {
        home_city: { type: 'string' }, new_city: { type: 'string' }, need: { type: 'string' }, lang: { type: 'string', enum: ['en', 'ar'] },
        favorites: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, name: { type: 'string' } }, required: ['kind', 'name'] } },
      },
      required: ['new_city', 'favorites'],
    },
  },
];

export async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return { id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'jisr', version: '1.0.0' } } };
  if (method === 'tools/list') return { id, result: { tools: allTools } };
  if (method === 'tools/call') {
    try {
      const out = params.name === 'first_week_plan' ? (await runAgent(params.arguments)).plan : await runTool(params.name, params.arguments);
      return { id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] } };
    } catch (e) { return { id, result: { isError: true, content: [{ type: 'text', text: e.message }] } }; }
  }
  if (method === 'ping') return { id, result: {} };
  if (id === undefined) return null; // notification
  return { id, error: { code: -32601, message: `Method not found: ${method}` } };
}

if (process.argv[1] && process.argv[1].endsWith('mcp.js')) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { return; }
    const out = await handle(msg);
    if (out) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...out }) + '\n');
  });
}
