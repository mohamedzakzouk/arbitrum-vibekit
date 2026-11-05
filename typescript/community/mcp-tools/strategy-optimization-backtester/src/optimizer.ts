/**
 * Optimizer: evaluates every parameter combination for a strategy and
 * returns a ranked report. Simulator-agnostic.
 *
 * Scoring: a single composite score is used to rank combinations so that
 * "best" means "best overall", not "best return". Higher is better.
 *
 *   score = totalReturnPct
 *         - maxDrawdownPct * 0.5      // penalize drawdown
 *         + sharpeRatio    * 5        // reward risk-adjusted return
 *         + winRatePct     * 0.1      // small reward for consistency
 *
 * The weights are deliberately simple and documented. They can be tuned
 * later or overridden per-call.
 */

import type {
  BacktestResult,
  OptimizationReport,
  ParameterCombination,
  SimulationMetrics,
  StrategyDefinition,
} from './types.js';
import { buildCombinations } from './strategies.js';
import type { Simulator } from './simulator.js';
import { defaultSimulator } from './simulator.js';

/** Default scoring weights (documented above). */
export const DEFAULT_SCORE_WEIGHTS = {
  drawdownPenalty: 0.5,
  sharpeReward: 5,
  winRateReward: 0.1,
} as const;

/** Computes the composite score for one set of metrics. */
export function computeScore(metrics: SimulationMetrics): number {
  return (
    metrics.totalReturnPct -
    metrics.maxDrawdownPct * DEFAULT_SCORE_WEIGHTS.drawdownPenalty +
    metrics.sharpeRatio * DEFAULT_SCORE_WEIGHTS.sharpeReward +
    metrics.winRatePct * DEFAULT_SCORE_WEIGHTS.winRateReward
  );
}

/** Options for an optimization run. */
export interface OptimizeOptions {
  /** Maximum number of results to return in rankedResults (default 10). */
  topN?: number;
  /** Simulator to use (default: SimpleSimulator). */
  simulator?: Simulator;
  /** Optional cap on total combinations evaluated (safety limit). */
  maxCombinations?: number;
}

/**
 * Evaluates every parameter combination for the strategy and returns a
 * ranked report. Deterministic: identical inputs yield identical output.
 */
export function optimizeStrategy(
  strategy: StrategyDefinition,
  options: OptimizeOptions = {},
): OptimizationReport {
  const simulator = options.simulator ?? defaultSimulator;
  const topN = options.topN ?? 10;
  const maxCombinations = options.maxCombinations ?? 10000;

  const allCombinations: ParameterCombination[] = buildCombinations(strategy);
  const totalCombinations = allCombinations.length;

  if (totalCombinations === 0) {
    throw new Error(
      `Strategy "${strategy.name}" has no parameter combinations to evaluate.`,
    );
  }
  if (totalCombinations > maxCombinations) {
    throw new Error(
      `Strategy "${strategy.name}" has ${totalCombinations} combinations, ` +
        `which exceeds the safety limit of ${maxCombinations}. ` +
        `Reduce the parameter ranges or raise maxCombinations.`,
    );
  }

  const results: BacktestResult[] = allCombinations.map((parameters) => {
    const metrics = simulator.simulate(strategy, parameters);
    return {
      parameters,
      ...metrics,
      score: round2(computeScore(metrics)),
    };
  });

  results.sort((a, b) => b.score - a.score);

  const best = results[0];
  if (best === undefined) {
    throw new Error(
      `Optimizer produced no results for strategy "${strategy.name}".`,
    );
  }

  return {
    strategy: strategy.name,
    totalCombinations,
    evaluatedCombinations: results.length,
    rankedResults: results.slice(0, topN),
    bestParameters: best.parameters,
    bestMetrics: {
      totalReturnPct: best.totalReturnPct,
      sharpeRatio: best.sharpeRatio,
      maxDrawdownPct: best.maxDrawdownPct,
      winRatePct: best.winRatePct,
      numTrades: best.numTrades,
    },
  };
}

/** Rounds to 2 decimal places. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
