/**
 * Simulator: evaluates a single parameter combination against a strategy.
 *
 * The interface is intentionally pluggable so a future ForkSimulator (Anvil-
 * based, forking real Arbitrum state) can be swapped in without changing the
 * optimizer or the MCP tool layer.
 *
 * The included SimpleSimulator uses a deterministic pseudo-random model
 * calibrated to plausible DeFi returns. It is not a price oracle: it exists
 * to demonstrate that the optimizer searches the parameter space correctly
 * and produces rankings. ForkSimulator (or a historical-data simulator) is
 * the natural next step and is documented in the README as the extension
 * path.
 */

import type {
  StrategyDefinition,
  ParameterCombination,
  SimulationMetrics,
} from './types.js';

/** Pluggable interface: any object that can evaluate one combination. */
export interface Simulator {
  readonly name: string;
  simulate(
    strategy: StrategyDefinition,
    parameters: ParameterCombination,
  ): SimulationMetrics;
}

/**
 * Deterministic pseudo-random generator (mulberry32).
 * Ensures the same parameters always produce the same result.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes a parameter combination + strategy name into a stable seed. */
function seedFromParameters(
  strategyName: string,
  parameters: ParameterCombination,
): number {
  let hash = 2166136261 ^ strategyName.length;
  const keys = Object.keys(parameters).sort();
  for (const key of keys) {
    const value = parameters[key];
    if (value === undefined) continue;
    const entry = `${key}=${value}`;
    for (let i = 0; i < entry.length; i += 1) {
      hash ^= entry.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

/**
 * Deterministic simulator that produces plausible DeFi metrics.
 * Semantic model (intentionally simplified, documented in README):
 *  - Higher rebalance frequency -> more trades, lower return after gas.
 *  - Tighter spread threshold -> more trades, higher variance.
 *  - Higher leverage (aave_looping) -> higher return, higher drawdown.
 */
export class SimpleSimulator implements Simulator {
  public readonly name = 'SimpleSimulator';

  public simulate(
    strategy: StrategyDefinition,
    parameters: ParameterCombination,
  ): SimulationMetrics {
    const seed = seedFromParameters(strategy.name, parameters);
    const rand = mulberry32(seed);

    const rebalance = parameters['rebalanceIntervalHours'] ?? 24;
    const spread = parameters['minApySpreadPct'] ?? 1;
    const maxAlloc = parameters['maxAllocationPct'] ?? 100;
    const leverage = parameters['targetLeverage'] ?? 1;
    const safety = parameters['safetyBufferPct'] ?? 10;

    // Base APY assumption: 8% for simple_yield_farming, 6% for aave_looping.
    const baseApy =
      strategy.name === 'aave_looping' ? 6 : 8;

    // Rebalance frequency: more frequent = more gas drag but captures spread.
    const rebalancesPerYear = Math.max(1, Math.floor((365 * 24) / rebalance));
    const gasDragPct = rebalancesPerYear * 0.02; // 0.02% per rebalance in fees

    // Spread capture: tighter thresholds capture more but with diminishing returns.
    const spreadCapturePct =
      spread <= 0.5 ? 6 : spread <= 1 ? 4 : spread <= 2 ? 2.5 : 1.5;

    // Allocation: smaller cap = safer, lower return.
    const allocMultiplier = 0.6 + (maxAlloc / 100) * 0.4;

    // Leverage: amplifies return and drawdown.
    const leverageMultiplier = leverage;
    const safetyPenaltyPct = Math.max(0, (20 - safety) * 0.15);

    const noise = rand() * 2 - 1;

    const grossReturnPct =
      (baseApy + spreadCapturePct) *
      allocMultiplier *
      leverageMultiplier *
      (1 + noise * 0.1);

    const totalReturnPct = Math.max(-100, grossReturnPct - gasDragPct - safetyPenaltyPct);

    // Drawdown scales with leverage and inversely with safety buffer.
    const maxDrawdownPct = Math.min(
      80,
      Math.abs(
        leverage * 8 + gasDragPct * 0.5 + safetyPenaltyPct * 1.5 + rand() * 4,
      ),
    );

    // Sharpe: return-to-drawdown ratio, clamped to a plausible range.
    const sharpeRatio =
      totalReturnPct > 0
        ? Math.min(4, Math.max(0, (totalReturnPct / Math.max(1, maxDrawdownPct)) * 1.2))
        : 0;

    // Win rate: more trades -> converges toward 50%.
    const numTrades = Math.floor(rebalancesPerYear * (1 + rand() * 0.3));
    const winRatePct =
      numTrades === 0
        ? 0
        : Math.min(95, Math.max(30, 55 + (spread >= 1 ? 10 : -5) + rand() * 10));

    return {
      totalReturnPct: round2(totalReturnPct),
      sharpeRatio: round2(sharpeRatio),
      maxDrawdownPct: round2(maxDrawdownPct),
      winRatePct: round2(winRatePct),
      numTrades,
    };
  }
}

/** Rounds to 2 decimal places. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Default simulator used by the optimizer. */
export const defaultSimulator: Simulator = new SimpleSimulator();
