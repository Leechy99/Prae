import { ContentItem, StrategyExecution } from '../../types';

export enum StrategyType {
  DENOISE = 'DENOISE',
  SEMANTIC = 'SEMANTIC',
  OUTPUT = 'OUTPUT',
}

export interface StrategyConfig {
  enabled: boolean;
  priority: number;
  params: Record<string, unknown>;
}

export interface Strategy {
  id: string;
  name: string;
  type: StrategyType;
  version: string;
  config: StrategyConfig;
  canApply(item: ContentItem): boolean;
  execute(item: ContentItem): Promise<StrategyExecution>;
}