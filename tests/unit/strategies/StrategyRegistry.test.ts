import { Strategy, StrategyType } from '../../../src/strategies/base/Strategy';
import { StrategyRegistry } from '../../../src/strategies/base/StrategyRegistry';

function createStrategy(id: string, type: StrategyType, priority: number): Strategy {
  return {
    id,
    name: id,
    type,
    version: '1.0.0',
    config: {
      enabled: true,
      priority,
      params: {},
    },
    canApply: () => true,
    execute: async () => ({
      id: `execution-${id}`,
      strategyId: id,
      startedAt: 0,
      completedAt: 1,
      success: true,
    }),
  };
}

describe('StrategyRegistry', () => {
  test('rejects duplicate IDs and maintains type indexes', () => {
    const registry = new StrategyRegistry();
    const first = createStrategy('first', StrategyType.DENOISE, 20);
    const second = createStrategy('second', StrategyType.DENOISE, 10);

    registry.register(first);
    registry.register(second);

    expect(() => registry.register(first)).toThrow('already registered');
    expect(registry.listByPriority(StrategyType.DENOISE).map(strategy => strategy.id))
      .toEqual(['second', 'first']);
    expect(registry.listByPriority(StrategyType.OUTPUT)).toEqual([]);
    expect(registry.unregister('missing')).toBe(false);
    expect(registry.unregister('first')).toBe(true);
    expect(registry.unregister('second')).toBe(true);
    expect(registry.getByType(StrategyType.DENOISE)).toEqual([]);
  });

  test('supports lookup and clear', () => {
    const registry = new StrategyRegistry();
    const strategy = createStrategy('semantic', StrategyType.SEMANTIC, 1);

    registry.register(strategy);

    expect(registry.get('semantic')).toBe(strategy);
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.getAll()).toEqual([strategy]);

    registry.clear();

    expect(registry.getAll()).toEqual([]);
    expect(registry.getByType(StrategyType.SEMANTIC)).toEqual([]);
  });

  test('unregisters safely when a defensive type index is missing', () => {
    const registry = new StrategyRegistry();
    const strategy = createStrategy('defensive', StrategyType.OUTPUT, 1);
    registry.register(strategy);

    const internals = registry as unknown as {
      strategiesByType: Map<StrategyType, Strategy[]>;
    };
    internals.strategiesByType.delete(StrategyType.OUTPUT);

    expect(registry.unregister('defensive')).toBe(true);
    expect(registry.get('defensive')).toBeUndefined();
    expect(registry.getByType(StrategyType.OUTPUT)).toEqual([]);
  });
});
