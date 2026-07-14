// Takt MCP server — exposes the knowledge-graph gather tools over the Model
// Context Protocol (stdio), so the graph is queryable from Claude Code, Claude
// Desktop, ChatGPT, or any other MCP client:
//
//   claude mcp add takt -- pnpm --dir /path/to/takt/services/agent mcp
//
// Read-only: only the gather lane is exposed (no canvas, no ask_user, no
// fetch_url). Tools are built in master mode, so every call takes a `product`
// slug — start with list_products. Reuses the exact same tool implementations
// the chat agent runs; stdout is reserved for the protocol (logs go to stderr).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildTaktTools } from "./tools.js";

const EXPOSED = new Set(["list_products", "find_entity", "explore_entity", "trace_path", "search_product", "get_media", "read_profile"]);

const tools = buildTaktTools({ product: null, manuals: [], emit: () => {} }).filter((t) => EXPOSED.has(t.name));

const server = new Server({ name: "takt", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool "${req.params.name}".` }], isError: true };
  try {
    const r = await tool.execute(req.params.arguments ?? {});
    return { content: [{ type: "text", text: r.output }], isError: !!r.isError };
  } catch (e: any) {
    return { content: [{ type: "text", text: `Tool failed: ${String(e?.message ?? e)}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error(`[takt-mcp] serving ${tools.length} graph tools over stdio`);
