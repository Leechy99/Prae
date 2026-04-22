import { Strategy, StrategyType } from './Strategy';

export class StrategyRegistry {
  private strategies: Map<string, Strategy> = new Map();
  private strategiesByType: Map<StrategyType, Strategy[]> = new Map();

  register(strategy: Strategy): void {
    if (this.strategies.has(strategy.id)) {
      throw new Error(`Strategy with id "${strategy.id}" is already registered`);
    }
    this.strategies.set(strategy.id, strategy);

    const typeStrategies = this.strategiesByType.get(strategy.type) || [];
    typeStrategies.push(strategy);
    this.strategiesByType.set(strategy.type, typeStrategies);
  }

  unregister(strategyId: string): boolean {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return false;
    }

    this.strategies.delete(strategyId);

    const typeStrategies = this.strategiesByType.get(strategy.type) || [];
    const filtered = typeStrategies.filter(s => s.id !== strategyId);
    if (filtered.length > 0) {
      this.strategiesByType.set(strategy.type, filtered);
    } else {
      this.strategiesByType.delete(strategy.type);
    }

    return true;
  }

  get(strategyId: string): Strategy | undefined {
    return this.strategies.get(strategyId);
  }

  getByType(type: StrategyType): Strategy[] {
    return this.strategiesByType.get(type) || [];
  }

  getAll(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  clear(): void {
    this.strategies.clear();
    this.strategiesByType.clear();
  }
}