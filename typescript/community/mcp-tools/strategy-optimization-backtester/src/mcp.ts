/**
 * MCP server for the Strategy Optimization Backtester.
 *
 * Tools:
 *   - list_strategies:    enumerate built-in strategies and their parameters
 *   - simulate_strategy:  evaluate one parameter combination
 *   - optimize_strategy:  grid-search the full parameter space, return ranking
 *
 * Schema note: only simple Zod types (z.string, z.number, z.unknown) are used.
 * z.record() triggers an internal _parse error in the MCP SDK's schema
 * converter, so parameters are accepted as z.unknown() and validated manually
 * via coerceParameters().
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  countCombinations,
  getStrategy,
  listStrategies,
} from './strategies.js';
import { optimizeStrategy } from './optimizer.js';
import { defaultSimulator } from './simulator.js';
import type { ParameterCombination, StrategyDefinition } from './types.js';

function jsonResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

function errorResult(message: string) {
  return jsonResult({ error: message });
}

function describeStrategy(strategy: StrategyDefinition) {
  return {
    name: strategy.name,
    description: strategy.description,
    parameters: strategy.parameters,
    totalCombinations: countCombinations(strategy),
  };
}

function coerceParameters(input: unknown): ParameterCombination | string {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return 'parameters must be a JSON object of numeric values.';
  }
  const result: ParameterCombination = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `Parameter "${key}" must be a finite number, got ${typeof value}.`;
    }
    result[key] = value;
  }
  return result;
}

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'strategy-optimization-backtester',
    version: '0.1.0',
  });

  // ---------------------------------------------------------------------------
  // Tool: list_strategies
  // ---------------------------------------------------------------------------
  server.tool(
    'list_strategies',
    'List the built-in DeFi strategies available for backtesting, with ' +
      'their parameter ranges and the size of each search space.',
    {},
    async () => {
      return jsonResult({
        simulator: defaultSimulator.name,
        strategies: listStrategies().map(describeStrategy),
      });
    },
  );

  // ---------------------------------------------------------------------------
  // Tool: simulate_strategy
  // ---------------------------------------------------------------------------
  const SimulateSchema = {
    strategy: z.string().describe('Strategy name, e.g. "aave_looping".'),
    parameters: z
      .unknown()
      .describe('Object of numeric parameter values for the strategy.'),
  };

  server.tool(
    'simulate_strategy',
    'Simulate a single parameter combination for a strategy and return its ' +
      'performance metrics (return, Sharpe, drawdown, win rate, trade count).',
    SimulateSchema,
    async (args) => {
      const strategyName = args.strategy;
      const strategy = getStrategy(strategyName);
      if (!strategy) {
        return errorResult(
          `Unknown strategy "${strategyName}". Call list_strategies to see ` +
            `available strategies.`,
        );
      }

      const numericParams = coerceParameters(args.parameters);
      if (typeof numericParams === 'string') {
        return errorResult(numericParams);
      }

      for (const param of strategy.parameters) {
        if (numericParams[param.name] === undefined) {
          return errorResult(
            `Missing required parameter "${param.name}" for strategy ` +
              `"${strategyName}".`,
          );
        }
      }

      const metrics = defaultSimulator.simulate(strategy, numericParams);
      return jsonResult({
        strategy: strategy.name,
        parameters: numericParams,
        simulator: defaultSimulator.name,
        metrics,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // Tool: optimize_strategy
  // ---------------------------------------------------------------------------
  const OptimizeSchema = {
    strategy: z.string().describe('Strategy name, e.g. "aave_looping".'),
    topN: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('How many ranked results to return (default 10).'),
  };

  server.tool(
    'optimize_strategy',
    'Run a grid search over every parameter combination for a strategy and ' +
      'return the ranked results plus the best configuration.',
    OptimizeSchema,
    async (args) => {
      const strategyName = args.strategy;
      const strategy = getStrategy(strategyName);
      if (!strategy) {
        return errorResult(
          `Unknown strategy "${strategyName}". Call list_strategies to see ` +
            `available strategies.`,
        );
      }

      try {
        const report = optimizeStrategy(strategy, { topN: args.topN ?? 10 });
        return jsonResult({ simulator: defaultSimulator.name, ...report });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message);
      }
    },
  );

  return server;
}
