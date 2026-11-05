/**
 * Built-in strategy definitions for the Strategy Optimization Backtester.
 *
 * Each strategy declares the parameters the optimizer will search over.
 * The simulator interprets the parameter values according to the strategy
 * semantics documented below.
 */

import type { StrategyDefinition, ParameterCombination } from './types.js';

/**
 * Simple yield farming: allocate capital to a single lending market and
 * rebalance between two markets based on the spread between their APYs.
 *
 * Parameters:
 *  - rebalanceIntervalHours: how often to re-check yields (1–168 hours)
 *  - minApySpreadPct: minimum APY gap required to trigger a rebalance (0.1–5%)
 *  - maxAllocationPct: maximum share of capital in a single market (50–100%)
 */
const SIMPLE_YIELD_FARMING: StrategyDefinition = {
  name: 'simple_yield_farming',
  description:
    'Rebalances capital between two lending markets based on APY spread. ' +
    'Searches rebalance frequency, spread threshold, and allocation cap.',
  parameters: [
    { name: 'rebalanceIntervalHours', values: [1, 6, 12, 24, 72, 168] },
    { name: 'minApySpreadPct', values: [0.1, 0.25, 0.5, 1, 2, 5] },
    { name: 'maxAllocationPct', values: [50, 70, 80, 90, 100] },
  ],
};

/**
 * Aave looping: deposit collateral, borrow against it, re-deposit, and repeat
 * up to a target leverage. The optimizer searches the leverage target and the
 * safety buffer below the liquidation threshold.
 *
 * Parameters:
 *  - targetLeverage: desired leverage multiple (1.5–3.0)
 *  - safetyBufferPct: percentage below LTV at which to de-lever (5–30%)
 *  - rebalanceIntervalHours: how often to check health factor (1–24 hours)
 */
const AAVE_LOOPING: StrategyDefinition = {
  name: 'aave_looping',
  description:
    'Loops a collateral/borrow position on Aave up to a target leverage. ' +
    'Searches leverage target, safety buffer, and rebalance frequency.',
  parameters: [
    { name: 'targetLeverage', values: [1.5, 2, 2.5, 3] },
    { name: 'safetyBufferPct', values: [5, 10, 15, 20, 30] },
    { name: 'rebalanceIntervalHours', values: [1, 6, 12, 24] },
  ],
};

/** Registry of built-in strategies, keyed by strategy name. */
export const STRATEGIES: Record<string, StrategyDefinition> = {
  [SIMPLE_YIELD_FARMING.name]: SIMPLE_YIELD_FARMING,
  [AAVE_LOOPING.name]: AAVE_LOOPING,
};

/** Returns all built-in strategies as an array. */
export function listStrategies(): StrategyDefinition[] {
  return Object.values(STRATEGIES);
}

/** Looks up a strategy by name; returns undefined if not found. */
export function getStrategy(name: string): StrategyDefinition | undefined {
  return STRATEGIES[name];
}

/** Number of parameter combinations in the strategy's search space. */
export function countCombinations(strategy: StrategyDefinition): number {
  return strategy.parameters.reduce(
    (product, param) => product * param.values.length,
    1,
  );
}

/**
 * Builds the full list of parameter combinations for a strategy
 * (Cartesian product of every parameter's value set).
 */
export function buildCombinations(
  strategy: StrategyDefinition,
): ParameterCombination[] {
  let combinations: ParameterCombination[] = [{}];
  for (const param of strategy.parameters) {
    const next: ParameterCombination[] = [];
    for (const combo of combinations) {
      for (const value of param.values) {
        next.push({ ...combo, [param.name]: value });
      }
    }
    combinations = next;
  }
  return combinations;
}
