# Strategy Optimization Backtester (MCP Server)

A backtesting suite for Vibekit agents that answers a different question than
existing safety tools: **"What is the most profitable configuration for this
strategy?"** rather than "Is this transaction safe to execute?"

Submitted as a community MCP tool under the Arbitrum Trailblazer 2.0 priority
*"The creation of a backtesting suite for Vibekit agents."*

## What it does

Given a strategy definition (a named workflow with a set of tunable numeric
parameters), the backtester evaluates **every** parameter combination and
returns a ranked list of results plus the single best configuration. Each
result includes total return, Sharpe ratio, max drawdown, win rate, and trade
count. Ranking uses a documented composite score:

    score = totalReturnPct
          - maxDrawdownPct * 0.5    # penalize drawdown
          + sharpeRatio    * 5      # reward risk-adjusted return
          + winRatePct     * 0.1    # small consistency reward

## Differentiation from ArbiSim Guard

ArbiSim Guard (also targeting this grant) is a **pre-flight safety layer**:
it validates a single transaction in an ephemeral fork to prevent capital loss.
This tool operates in a **different domain**:

| | ArbiSim Guard | This tool |
|---|---|---|
| Question answered | "Is this transaction safe?" | "What is the best parameter configuration?" |
| User need | Risk mitigation | Alpha generation / strategy tuning |
| Output | Risk score (allow / flag / block) | Ranked parameter sets + best configuration |
| Method | Single-transaction simulation | Algorithmic search across thousands of combinations |

The two tools are **complementary**, not competing.

## MCP tools exposed

| Tool | Input | Output |
|---|---|---|
| `list_strategies` | — | All built-in strategies, their parameter ranges, and search-space sizes |
| `simulate_strategy` | `strategy`, `parameters` | Metrics for one parameter combination |
| `optimize_strategy` | `strategy`, optional `topN` (1–100, default 10) | Full report: total/evaluated combinations, top-N ranked results, best parameters, best metrics |

### Built-in strategies

| Strategy | Parameters | Combinations |
|---|---|---|
| `simple_yield_farming` | `rebalanceIntervalHours` (6), `minApySpreadPct` (6), `maxAllocationPct` (5) | **180** |
| `aave_looping` | `targetLeverage` (4), `safetyBufferPct` (5), `rebalanceIntervalHours` (4) | **80** |

## Usage

### As an MCP server (stdio)

    pnpm build
    node dist/index.js

### As an MCP server (HTTP)

The server currently exposes stdio transport only. HTTP transport (matching the
`coingecko-mcp-server` pattern) can be added in a follow-up by importing
`StreamableHTTPServerTransport` in `src/index.ts`.

### Programmatic (from another package)

    import { createServer } from '@arbitrum-vibekit/strategy-optimization-backtester';
    const server = await createServer();

## Testing

    pnpm test

The smoke test (`test-mcp.ts`) spawns the compiled server, connects a real MCP
client over stdio, and exercises all three tools end-to-end:

- `list_strategies` — verifies the two built-in strategies and their combination counts
- `simulate_strategy` — verifies a single evaluation returns plausible metrics
- `optimize_strategy` — verifies 80/80 combinations are evaluated, ranking works, and best parameters/metrics are returned
- **determinism** — re-runs `optimize_strategy` and asserts identical best parameters
- **error path** — calls `simulate_strategy` with an unknown strategy and asserts a structured error is returned

Expected output ends with:

    [test] determinism: PASS
    [test] error path: PASS
    [test] all checks complete

## Architecture

    src/
    ├── types.ts        # Shared interfaces (StrategyDefinition, BacktestResult, etc.)
    ├── strategies.ts   # Built-in strategies + Cartesian-product combination builder
    ├── simulator.ts    # Simulator interface + deterministic SimpleSimulator
    ├── optimizer.ts    # Grid search, scoring, ranking
    ├── mcp.ts          # MCP tool registration (list/simulate/optimize)
    └── index.ts        # stdio entry point

### The Simulator is pluggable

`simulator.ts` exports a `Simulator` interface:

    interface Simulator {
      readonly name: string;
      simulate(strategy: StrategyDefinition, parameters: ParameterCombination): SimulationMetrics;
    }

`SimpleSimulator` is the default. It uses a **deterministic** seeded PRNG
(mulberry32) so that identical inputs always produce identical outputs — a
requirement for meaningful optimization. The model is semantically plausible
(frequent rebalancing incurs gas drag; higher leverage amplifies both return
and drawdown) but is **not a price oracle**.

The natural next step is a `ForkSimulator` that uses Anvil to fork Arbitrum
mainnet at a historical block and executes real protocol calls through the
Ember MCP Tool Server. Because the interface is pluggable, that upgrade
requires no changes to the optimizer or the MCP tool layer — only a new class
in `simulator.ts` and a config toggle in `optimizeStrategy()`.

## Schema note: Zod pin to 3.25.76

The MCP SDK (`@modelcontextprotocol/sdk`) resolves Zod from the consuming
package. Versions up to ~1.22.x call Zod v3 internals (`_parse`, `_def`) in
their JSON-schema converter. When a package resolves Zod v4 (as the workspace
`catalog:` does), calling any tool crashes with:

    keyValidator._parse is not a function

To avoid this, `package.json` pins `"zod": "3.25.76"` (an exact version) and
the lockfile importer entry is updated to match. Other workspaces can keep
using the catalog's Zod 4; only this package pins v3.

## Limitations and next steps

- **Simulator**: `SimpleSimulator` is a demonstration model, not a fork-based
  historical backtester. The pluggable interface is the extension point.
- **Transport**: stdio only. HTTP/SSE transport can be added by copying the
  dual-transport pattern from `coingecko-mcp-server`.
- **Strategies**: two strategies included. Adding more is a ~20-line change in
  `strategies.ts`.
- **Scoring weights**: documented and adjustable, currently fixed at
  return=1.0, drawdown=−0.5, Sharpe=5, winRate=0.1.

## License

ISC (matches the rest of the Vibekit community tools).
