export interface ContentHint {
  mimeType?: string;
  encoding?: string;
  estimatedSize?: number;
  possibleTypes?: string[];
  confidence?: number;
}

export interface ContentItem {
  id: string;
  source: string;
  raw: Uint8Array;
  meta: Record<string, unknown>;
  hints: ContentHint;
}

export interface StrategyExecution {
  id: string;
  strategyId: string;
  startedAt: number;
  completedAt?: number;
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface ProcessingResult {
  id: string;
  contentItem: ContentItem;
  strategiesUsed: StrategyExecution[];
  fusedOutput: unknown;
  confidence: ConfidenceScore;
  outcome: 'SUCCESS' | 'RETRY_SUCCESS' | 'CLOUD_ESCALATED' | 'HUMAN_INTERVENTION' | 'FAILED';
  processingTimeMs: number;
  retryCount: number;
}

export interface ConfidenceScore {
  overall: number;
  components: {
    textQuality: number;
    entityExtraction: number;
    structuralIntegrity: number;
    contextualCoherence: number;
  };
  bonus: {
    historicalConsistency: number;
    multiStrategyAgreement: number;
  };
  isPassing: boolean;
}

export interface ConfidenceConfig {
  thresholds: {
    pass: number;
    retry: number;
    escalate: number;
  };
  components: {
    textQuality: WeightConfig;
    entityExtraction: WeightConfig;
    structuralIntegrity: WeightConfig;
    contextualCoherence: WeightConfig;
  };
  historicalWeight: number;
  consistencyBonus: number;
}

export interface WeightConfig {
  weight: number;
  indicators: string[];
}
