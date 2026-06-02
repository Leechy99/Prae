# Module: Strategies Base (`src/strategies/base/`)

## Module Overview

Foundation classes for the strategy plugin system. Defines the `Strategy` interface and provides `StrategyRegistry` (strategy management) and `StrategyExecutor` (execution engine).

## Files

| File | Exports | Purpose |
|------|---------|---------|
| `Strategy.ts` | `StrategyType` enum, `StrategyConfig`, `Strategy`, `StrategyExecution` interface | Contract for all strategies |
| `StrategyRegistry.ts` | `StrategyRegistry` | In-memory registry with type/priority queries |
| `StrategyExecutor.ts` | `StrategyExecutor`, `ExecuteOptions`, `ExecutionResult` | Executes strategies, handles errors, fuses results |

## StrategyRegistry

```typescript
class StrategyRegistry {
  register(strategy: Strategy): void;     // throws if duplicate ID
  unregister(strategyId: string): boolean;
  get(strategyId: string): Strategy | undefined;
  getByType(type: StrategyType): Strategy[];
  listByPriority(type: StrategyType): Strategy[];  // sorted ascending by priority
  getAll(): Strategy[];
  clear(): void;
}
```

## StrategyExecutor

```typescript
class StrategyExecutor {
  register(strategy: Strategy): void;
  unregister(strategyId: string): boolean;

  executeStrategies(
    items: ContentItem[],
    options?: { stopOnError?: boolean }
  ): Promise<ExecutionResult[]>;

  fuseResults(results: ExecutionResult[]): unknown;
  // Returns:
  //   - single output if only one succeeded
  //   - { type: 'failed', sources: 0, data: [] } if all failed
  //   - string (cleanedText/filteredText) if found among successful
  //   - { type: 'fused', sources: N, data: [...] } otherwise
}
```

**Execution contract:** For each item, iterates all registered strategies. Skips if `!strategy.config.enabled` or `!strategy.canApply(item)`. Wraps errors in `ExecutionResult` with `success: false`.

## StrategyExecution Return Shape

Strategies return `StrategyExecution` (not raw output):

```typescript
interface StrategyExecution {
  id: string;              // crypto.randomUUID()
  strategyId: string;
  startedAt: number;
  completedAt?: number;
  success: boolean;
  output?: unknown;
  error?: string;
}
```

## Testing

- `tests/unit/strategies/StrategyExecutor.test.ts` — full coverage of executeStrategies and fuseResults

## Related Files

| Path | Purpose |
|------|---------|
| `src/strategies/denoise/` | Concrete strategy implementations |
| `src/strategies/semantic/` | Concrete strategy implementations |
| `src/strategies/output/` | Concrete strategy implementations |
| `src/core/Pipeline.ts` | Uses Registry and Executor for pipeline orchestration |