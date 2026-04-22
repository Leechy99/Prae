import type { ProcessingResult } from '../types';

export interface ExperienceRecordInput {
  sourceType: string;
  contentType: string;
  rawHash: string;
  size: number;
}

export interface ExperienceRecordProcessing {
  strategiesUsed: string[];
  fusionMethod: string;
  finalConfidence: number;
  processingTimeMs: number;
  retryCount: number;
}

export interface HumanFeedback {
  correctedResult?: unknown;
  feedback: string;
}

export interface Learning {
  isLearned: boolean;
  strategyUpdates?: Record<string, unknown>;
}

export interface ExperienceRecord {
  id: string;
  tenantId: string;
  input: ExperienceRecordInput;
  processing: ExperienceRecordProcessing;
  outcome: ProcessingResult['outcome'];
  humanFeedback?: HumanFeedback;
  learning: Learning;
  createdAt: number;
  updatedAt: number;
}