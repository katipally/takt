// Takt MCP server — stdio entry point, for the machine that runs Takt locally:
//
//   claude mcp add takt -- pnpm --dir /path/to/takt/services/agent mcp
//
// Hosted installs don't use this file: the same server is mounted over
// Streamable HTTP at <site>/mcp (see server.ts), so remote users connect with
//   claude mcp add --transport http takt https://<your-host>/mcp
// stdout is reserved for the protocol (logs go to stderr).

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "./mcp-server.js";

const server = buildMcpServer();
await server.connect(new StdioServerTransport());
console.error("[takt-mcp] serving graph tools over stdio");
