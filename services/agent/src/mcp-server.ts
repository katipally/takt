// The Takt MCP server definition — the read-only gather lane (knowledge-graph
// tools) exposed over the Model Context Protocol. Shared by two transports:
//   • stdio  (src/mcp.ts)     — local use on the machine that runs Takt
//   • HTTP   (server.ts /mcp) — hosted use: any MCP client pointed at the site
// Tools are built in master mode, so every call takes a `product` slug — start
// with list_products.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildTaktTools } from "./tools.js";

const EXPOSED = new Set(["list_products", "find_entity", "explore_entity", "trace_path", "search_product", "get_media", "read_profile"]);

export function buildMcpServer(): Server {
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

  return server;
}
