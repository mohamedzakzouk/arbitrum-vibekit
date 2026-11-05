/**
 * Shared type definitions for the Strategy Optimization Backtester.
 */

/** A single parameter with a discrete set of candidate values. */
export interface ParameterRange {
  name: string;
  values: number[];
}

/** A named strategy that can be simulated with a set of numeric parameters. */
export interface StrategyDefinition {
  name: string;
  description: string;
  parameters: ParameterRange[];
}

/** One point in the parameter space. */
export interface ParameterCombination {
  [parameterName: string]: number;
}

/** Metrics produced by a single simulation run. */
export interface SimulationMetrics {
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  winRatePct: number;
  numTrades: number;
}

/** A single evaluated parameter combination with its metrics. */
export interface BacktestResult extends SimulationMetrics {
  parameters: ParameterCombination;
  score: number;
}

/** Full output of an optimization run. */
export interface OptimizationReport {
  strategy: string;
  totalCombinations: number;
  evaluatedCombinations: number;
  rankedResults: BacktestResult[];
  bestParameters: ParameterCombination;
  bestMetrics: SimulationMetrics;
}
