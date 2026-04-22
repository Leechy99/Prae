import { ConfidenceScorer } from '../../../src/core/ConfidenceScorer';
import type { ContentItem, StrategyExecution } from '../../../src/types';

describe('ConfidenceScorer', () => {
  let scorer: ConfidenceScorer;

  beforeEach(() => {
    scorer = new ConfidenceScorer();
  });

  const createContentItem = (meta: Record<string, unknown> = {}): ContentItem => ({
    id: 'test-id',
    source: 'test-source',
    raw: new Uint8Array(),
    meta,
    hints: {},
  });

  const createExecutions = (successfulCount: number, totalCount: number): StrategyExecution[] =>
    Array.from({ length: totalCount }, (_, i) => ({
      id: `exec-${i}`,
      strategyId: `strategy-${i}`,
      startedAt: Date.now(),
      completedAt: Date.now(),
      success: i < successfulCount,
    }));

  describe('calculateScore', () => {
    it('returns high confidence for well-structured content with entities', () => {
      const contentItem = createContentItem({
        cleanedText: 'This is a well-structured document with proper punctuation and multiple sentences.',
        entities: ['Entity1', 'Entity2', 'Entity3'],
        mentions: ['Mention1', 'Mention2'],
        namedEntities: ['NE1', 'NE2'],
        structure: { title: 'Test', sections: ['intro', 'body'] },
        format: 'markdown',
        schema: { type: 'document' },
        coherence: 0.9,
        context: 'This is a relevant context for the content.',
      });

      const executions = createExecutions(2, 2);
      const metadata = { historicalScore: 0.9, successfulStrategyIds: ['strategy-1', 'strategy-2'] };

      const score = scorer.calculateScore(contentItem, executions, metadata);

      expect(score.overall).toBeGreaterThan(0.85);
      expect(score.isPassing).toBe(true);
      expect(score.components.textQuality).toBeGreaterThan(0.5);
      expect(score.components.entityExtraction).toBeGreaterThan(0.5);
      expect(score.components.structuralIntegrity).toBeGreaterThan(0.5);
      expect(score.bonus.historicalConsistency).toBeGreaterThan(0);
      expect(score.bonus.multiStrategyAgreement).toBeGreaterThan(0);
    });

    it('returns low confidence for empty content', () => {
      const contentItem = createContentItem({});

      const score = scorer.calculateScore(contentItem, []);

      expect(score.overall).toBeLessThan(0.5);
      expect(score.isPassing).toBe(false);
      expect(score.components.textQuality).toBe(0);
      expect(score.components.entityExtraction).toBe(0.3);
    });

    it('applies historical consistency bonus when historical score is provided', () => {
      const contentItem = createContentItem({
        cleanedText: 'Some content here.',
      });

      const scoreWithoutHistorical = scorer.calculateScore(contentItem, [], { historicalScore: undefined });
      const scoreWithHistorical = scorer.calculateScore(contentItem, [], { historicalScore: 0.8 });

      expect(scoreWithHistorical.bonus.historicalConsistency).toBeGreaterThan(scoreWithoutHistorical.bonus.historicalConsistency);
    });

    it('applies multi-strategy agreement bonus when multiple strategies succeed', () => {
      const executions = createExecutions(2, 2);
      const contentItem = createContentItem({
        cleanedText: 'Content that has been processed by multiple strategies.',
      });

      const metadata = { successfulStrategyIds: ['strategy-1', 'strategy-2'] };
      const score = scorer.calculateScore(contentItem, executions, metadata);

      expect(score.bonus.multiStrategyAgreement).toBeGreaterThan(0);
    });

    it('calculates text quality based on cleanedText and textContent', () => {
      const contentWithCleanedText = createContentItem({
        cleanedText: 'This is a sample text with proper formatting and multiple words.',
      });

      const contentWithTextContent = createContentItem({
        textContent: 'Another sample text with proper formatting and multiple words.',
      });

      const scoreCleanedText = scorer.calculateScore(contentWithCleanedText, []);
      const scoreTextContent = scorer.calculateScore(contentWithTextContent, []);

      expect(scoreCleanedText.components.textQuality).toBeGreaterThan(0.5);
      expect(scoreTextContent.components.textQuality).toBeGreaterThan(0.5);
    });

    it('calculates entity extraction from entities, mentions, and namedEntities metadata', () => {
      const contentWithEntities = createContentItem({
        cleanedText: 'Sample text.',
        entities: Array(10).fill('entity'),
        mentions: Array(5).fill('mention'),
        namedEntities: Array(3).fill('named'),
      });

      const contentWithoutEntities = createContentItem({
        cleanedText: 'Sample text.',
      });

      const scoreWithEntities = scorer.calculateScore(contentWithEntities, []);
      const scoreWithoutEntities = scorer.calculateScore(contentWithoutEntities, []);

      expect(scoreWithEntities.components.entityExtraction).toBeGreaterThan(scoreWithoutEntities.components.entityExtraction);
    });

    it('calculates structural integrity from structure, format, and schema metadata', () => {
      const wellStructuredContent = createContentItem({
        cleanedText: 'Sample text.',
        structure: { sections: ['intro', 'body', 'conclusion'] },
        format: 'json',
        schema: { type: 'article', properties: ['title', 'content'] },
      });

      const unstructuredContent = createContentItem({
        cleanedText: 'Sample text.',
      });

      const scoreStructured = scorer.calculateScore(wellStructuredContent, []);
      const scoreUnstructured = scorer.calculateScore(unstructuredContent, []);

      expect(scoreStructured.components.structuralIntegrity).toBeGreaterThan(scoreUnstructured.components.structuralIntegrity);
    });

    it('calculates contextual coherence from coherence metadata or context field', () => {
      const contentWithCoherence = createContentItem({
        cleanedText: 'Sample text.',
        coherence: 0.95,
      });

      const contentWithContext = createContentItem({
        cleanedText: 'Sample text.',
        context: 'This is a longer context that provides meaningful background information.',
      });

      const scoreWithCoherence = scorer.calculateScore(contentWithCoherence, []);
      const scoreWithContext = scorer.calculateScore(contentWithContext, []);

      expect(scoreWithCoherence.components.contextualCoherence).toBe(0.95);
      expect(scoreWithContext.components.contextualCoherence).toBeGreaterThan(0.5);
    });
  });

  describe('shouldRetry', () => {
    it('returns true when overall score is between retry and pass thresholds', () => {
      const score = {
        overall: 0.7,
        components: { textQuality: 0.6, entityExtraction: 0.7, structuralIntegrity: 0.7, contextualCoherence: 0.7 },
        bonus: { historicalConsistency: 0, multiStrategyAgreement: 0 },
        isPassing: false,
      };

      expect(scorer.shouldRetry(score)).toBe(true);
    });

    it('returns false when overall score is below retry threshold', () => {
      const score = {
        overall: 0.5,
        components: { textQuality: 0.4, entityExtraction: 0.4, structuralIntegrity: 0.4, contextualCoherence: 0.4 },
        bonus: { historicalConsistency: 0, multiStrategyAgreement: 0 },
        isPassing: false,
      };

      expect(scorer.shouldRetry(score)).toBe(false);
    });

    it('returns false when overall score is at or above pass threshold', () => {
      const score = {
        overall: 0.9,
        components: { textQuality: 0.8, entityExtraction: 0.9, structuralIntegrity: 0.9, contextualCoherence: 0.9 },
        bonus: { historicalConsistency: 0.1, multiStrategyAgreement: 0.05 },
        isPassing: true,
      };

      expect(scorer.shouldRetry(score)).toBe(false);
    });
  });

  describe('shouldEscalate', () => {
    it('returns true when overall score is below escalate threshold (0.4)', () => {
      const score = {
        overall: 0.3,
        components: { textQuality: 0.2, entityExtraction: 0.3, structuralIntegrity: 0.2, contextualCoherence: 0.3 },
        bonus: { historicalConsistency: 0, multiStrategyAgreement: 0 },
        isPassing: false,
      };

      expect(scorer.shouldEscalate(score)).toBe(true);
    });

    it('returns false when overall score is at or above escalate threshold', () => {
      const score = {
        overall: 0.5,
        components: { textQuality: 0.4, entityExtraction: 0.5, structuralIntegrity: 0.4, contextualCoherence: 0.5 },
        bonus: { historicalConsistency: 0, multiStrategyAgreement: 0 },
        isPassing: false,
      };

      expect(scorer.shouldEscalate(score)).toBe(false);
    });

    it('returns true for very low scores', () => {
      const score = {
        overall: 0.1,
        components: { textQuality: 0.1, entityExtraction: 0.1, structuralIntegrity: 0.1, contextualCoherence: 0.1 },
        bonus: { historicalConsistency: 0, multiStrategyAgreement: 0 },
        isPassing: false,
      };

      expect(scorer.shouldEscalate(score)).toBe(true);
    });
  });

  describe('constructor with custom config', () => {
    it('uses custom thresholds when provided', () => {
      const customScorer = new ConfidenceScorer({
        thresholds: { pass: 0.9, retry: 0.7, escalate: 0.5 },
      });

      const contentItem = createContentItem({
        cleanedText: 'x',
      });

      const score = customScorer.calculateScore(contentItem, []);

      expect(score.isPassing).toBe(false);
      expect(customScorer.shouldRetry(score)).toBe(false);
      expect(customScorer.shouldEscalate(score)).toBe(true);
    });

    it('uses default thresholds when not provided', () => {
      const defaultScorer = new ConfidenceScorer({});

      const contentItem = createContentItem({
        cleanedText: 'x',
      });

      const score = defaultScorer.calculateScore(contentItem, []);

      expect(defaultScorer.shouldEscalate(score)).toBe(true);
    });
  });

  describe('weighted component calculation', () => {
    it('applies correct weights to components', () => {
      const contentItem = createContentItem({
        cleanedText: 'x'.repeat(500),
        coherence: 1,
      });

      const executions = createExecutions(2, 2);

      const score = scorer.calculateScore(contentItem, executions);

      expect(score.components.textQuality).toBeGreaterThan(0);
      expect(score.components.entityExtraction).toBe(0.3);
      expect(score.components.structuralIntegrity).toBe(0.5);
      expect(score.components.contextualCoherence).toBe(1);

      const expectedWeightedSum =
        score.components.textQuality * 0.3 +
        score.components.entityExtraction * 0.25 +
        score.components.structuralIntegrity * 0.25 +
        score.components.contextualCoherence * 0.2;

      expect(score.overall).toBeCloseTo(expectedWeightedSum + score.bonus.historicalConsistency + score.bonus.multiStrategyAgreement, 5);
    });
  });
});