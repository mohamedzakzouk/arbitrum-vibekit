/**
 * End-to-end smoke test: spawns the compiled MCP server over stdio, connects
 * a real MCP client, then calls list_strategies, simulate_strategy, and
 * optimize_strategy in sequence.
 *
 * Run with: pnpm test
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
  });

  const client = new Client(
    { name: 'backtester-smoke-test', version: '0.1.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log('[test] connected to server');

  const tools = await client.listTools();
  console.log(`[test] tools discovered: ${tools.tools.map((t) => t.name).join(', ')}`);

  // --- list_strategies ---
  const listResp = await client.callTool({ name: 'list_strategies', arguments: {} });
  const listText = extractText(listResp);
  const listJson = JSON.parse(listText) as {
    simulator: string;
    strategies: Array<{ name: string; totalCombinations: number }>;
  };
  console.log('[test] list_strategies OK');
  console.log(`       simulator=${listJson.simulator}`);
  for (const s of listJson.strategies) {
    console.log(`       - ${s.name} (${s.totalCombinations} combinations)`);
  }

  // --- simulate_strategy ---
  const simResp = await client.callTool({
    name: 'simulate_strategy',
    arguments: {
      strategy: 'aave_looping',
      parameters: {
        targetLeverage: 2,
        safetyBufferPct: 10,
        rebalanceIntervalHours: 12,
      },
    },
  });
  const simJson = JSON.parse(extractText(simResp)) as { metrics: Record<string, number> };
  console.log('[test] simulate_strategy OK');
  console.log(`       metrics=${JSON.stringify(simJson.metrics)}`);

  // --- optimize_strategy ---
  const optResp = await client.callTool({
    name: 'optimize_strategy',
    arguments: { strategy: 'aave_looping', topN: 3 },
  });
  const optJson = JSON.parse(extractText(optResp)) as {
    totalCombinations: number;
    evaluatedCombinations: number;
    bestParameters: Record<string, number>;
    bestMetrics: Record<string, number>;
    rankedResults: Array<{ score: number }>;
  };
  console.log('[test] optimize_strategy OK');
  console.log(`       totalCombinations=${optJson.totalCombinations}`);
  console.log(`       evaluatedCombinations=${optJson.evaluatedCombinations}`);
  console.log(`       bestParameters=${JSON.stringify(optJson.bestParameters)}`);
  console.log(`       bestMetrics=${JSON.stringify(optJson.bestMetrics)}`);
  console.log(`       topScores=${optJson.rankedResults.map((r) => r.score).join(', ')}`);

  // --- determinism check: run again, expect identical bestParameters ---
  const optResp2 = await client.callTool({
    name: 'optimize_strategy',
    arguments: { strategy: 'aave_looping', topN: 3 },
  });
  const optJson2 = JSON.parse(extractText(optResp2)) as {
    bestParameters: Record<string, number>;
  };
  const same = JSON.stringify(optJson.bestParameters) === JSON.stringify(optJson2.bestParameters);
  console.log(`[test] determinism: ${same ? 'PASS' : 'FAIL'}`);

  // --- error path: unknown strategy ---
  const errResp = await client.callTool({
    name: 'simulate_strategy',
    arguments: { strategy: 'does_not_exist', parameters: {} },
  });
  const errJson = JSON.parse(extractText(errResp)) as { error?: string };
  console.log(`[test] error path: ${errJson.error ? 'PASS' : 'FAIL'}`);

  await client.close();
  console.log('[test] all checks complete');
}

function extractText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  if (!content || content.length === 0) {
    throw new Error('Empty content in MCP response');
  }
  const first = content[0];
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('Unexpected content shape in MCP response');
  }
  return first.text;
}

main().catch((err) => {
  console.error('[test] FAILED:', err);
  process.exit(1);
});
