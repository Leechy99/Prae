import type { ConfidenceScore, ConfidenceConfig, StrategyExecution, ContentItem } from '../types';

const DEFAULT_CONFIG: ConfidenceConfig = {
  thresholds: {
    pass: 0.85,
    retry: 0.6,
    escalate: 0.4,
  },
  components: {
    textQuality: { weight: 0.3, indicators: ['cleanedText', 'textContent', 'length'] },
    entityExtraction: { weight: 0.25, indicators: ['entities', 'mentions', 'namedEntities'] },
    structuralIntegrity: { weight: 0.25, indicators: ['structure', 'format', 'schema'] },
    contextualCoherence: { weight: 0.2, indicators: ['coherence', 'context', 'relevance'] },
  },
  historicalWeight: 0.1,
  consistencyBonus: 0.05,
};

export class ConfidenceScorer {
  private config: ConfidenceConfig;

  constructor(config: Partial<ConfidenceConfig> = {}) {
    this.config = {
      thresholds: config.thresholds ?? { ...DEFAULT_CONFIG.thresholds },
      components: config.components ?? { ...DEFAULT_CONFIG.components },
      historicalWeight: config.historicalWeight ?? DEFAULT_CONFIG.historicalWeight,
      consistencyBonus: config.consistencyBonus ?? DEFAULT_CONFIG.consistencyBonus,
    };
  }

  calculateScore(
    contentItem: ContentItem,
    executions: StrategyExecution[],
    metadata?: { historicalScore?: number; successfulStrategyIds?: string[] }
  ): ConfidenceScore {
    const textQuality = this.calculateTextQuality(contentItem);
    const entityExtraction = this.calculateEntityExtraction(contentItem);
    const structuralIntegrity = this.calculateStructuralIntegrity(contentItem);
    const contextualCoherence = this.calculateContextualCoherence(contentItem, executions);

    const weightedComponents =
      textQuality * this.config.components.textQuality.weight +
      entityExtraction * this.config.components.entityExtraction.weight +
      structuralIntegrity * this.config.components.structuralIntegrity.weight +
      contextualCoherence * this.config.components.contextualCoherence.weight;

    const historicalConsistency = this.calculateHistoricalConsistency(metadata?.historicalScore);
    const multiStrategyAgreement = this.calculateMultiStrategyAgreement(executions, metadata?.successfulStrategyIds);

    const bonusSum = historicalConsistency + multiStrategyAgreement;
    const rawOverall = Math.min(1, Math.max(0, weightedComponents + bonusSum));

    return {
      overall: rawOverall,
      components: {
        textQuality,
        entityExtraction,
        structuralIntegrity,
        contextualCoherence,
      },
      bonus: {
        historicalConsistency,
        multiStrategyAgreement,
      },
      isPassing: rawOverall >= this.config.thresholds.pass,
    };
  }

  private calculateTextQuality(contentItem: ContentItem): number {
    const text = (contentItem.meta.cleanedText as string) || (contentItem.meta.textContent as string) || '';

    if (!text || text.trim().length === 0) {
      return 0;
    }

    const length = text.trim().length;
    const lengthScore = Math.min(1, length / 500);

    const wordDensity = text.split(/\s+/).filter(w => w.length > 2).length / Math.max(1, length / 5);
    const densityScore = Math.min(1, wordDensity / 10);

    const hasUpperCase = /[A-Z]/.test(text);
    const hasLowerCase = /[a-z]/.test(text);
    const hasPunctuation = /[.!?;:]/.test(text);
    const formatScore = (hasUpperCase && hasLowerCase ? 0.3 : 0) + (hasPunctuation ? 0.2 : 0);

    return Math.min(1, lengthScore * 0.5 + densityScore * 0.3 + formatScore);
  }

  private calculateEntityExtraction(contentItem: ContentItem): number {
    const entities = contentItem.meta.entities as unknown[] | undefined;
    const mentions = contentItem.meta.mentions as unknown[] | undefined;
    const namedEntities = contentItem.meta.namedEntities as unknown[] | undefined;

    const entityCount = (entities?.length ?? 0) + (mentions?.length ?? 0) + (namedEntities?.length ?? 0);

    if (entityCount === 0) {
      return 0.3;
    }

    return Math.min(1, 0.4 + (entityCount / 20) * 0.6);
  }

  private calculateStructuralIntegrity(contentItem: ContentItem): number {
    const structure = contentItem.meta.structure as Record<string, unknown> | undefined;
    const format = contentItem.meta.format as string | undefined;
    const schema = contentItem.meta.schema as Record<string, unknown> | undefined;

    let score = 0.5;

    if (structure && Object.keys(structure).length > 0) {
      score += 0.2;
    }

    if (format && ['json', 'xml', 'html', 'markdown'].includes(format.toLowerCase())) {
      score += 0.15;
    }

    if (schema && Object.keys(schema).length > 0) {
      score += 0.15;
    }

    return Math.min(1, score);
  }

  private calculateContextualCoherence(contentItem: ContentItem, executions: StrategyExecution[]): number {
    const coherence = contentItem.meta.coherence as number | undefined;
    const context = contentItem.meta.context as string | undefined;

    if (coherence !== undefined) {
      return Math.min(1, Math.max(0, coherence));
    }

    let score = 0.5;

    if (context && context.trim().length > 10) {
      score += 0.3;
    }

    const successfulExecutions = executions.filter(e => e.success).length;
    if (successfulExecutions > 0) {
      score += Math.min(0.2, successfulExecutions * 0.1);
    }

    return Math.min(1, score);
  }

  private calculateHistoricalConsistency(historicalScore?: number): number {
    if (historicalScore === undefined) {
      return 0;
    }

    return Math.min(this.config.historicalWeight, historicalScore * this.config.historicalWeight);
  }

  private calculateMultiStrategyAgreement(
    executions: StrategyExecution[],
    successfulStrategyIds?: string[]
  ): number {
    if (executions.length < 2) {
      return 0;
    }

    const successfulCount = executions.filter(e => e.success).length;
    const successRate = successfulCount / executions.length;

    let bonus = 0;
    if (successRate === 1 && executions.length >= 2) {
      bonus = this.config.consistencyBonus;
    }

    if (successfulStrategyIds && successfulStrategyIds.length >= 2) {
      const uniqueStrategies = new Set(successfulStrategyIds).size;
      if (uniqueStrategies >= 2) {
        bonus += this.config.consistencyBonus * 0.5;
      }
    }

    return Math.min(this.config.consistencyBonus * 1.5, bonus);
  }

  shouldRetry(score: ConfidenceScore): boolean {
    return score.overall >= this.config.thresholds.retry && score.overall < this.config.thresholds.pass;
  }

  shouldEscalate(score: ConfidenceScore): boolean {
    return score.overall < this.config.thresholds.escalate;
  }
}