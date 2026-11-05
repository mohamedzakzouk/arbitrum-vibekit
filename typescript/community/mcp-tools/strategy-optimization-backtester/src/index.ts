#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp.js';

async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Strategy Optimization Backtester MCP server started.');
}

main().catch((err) => {
  console.error(err);
  process.exit(-1);
});
