import { Router, Request, Response } from 'express';
import { Pipeline } from '../core/Pipeline';
import { Strategy, StrategyType } from '../strategies/base/Strategy';
import { StrategyRegistry } from '../strategies/base/StrategyRegistry';
import { InputRegistry } from '../input/InputRegistry';
import { HTMLInputSource } from '../input/HTMLInputSource';
import { HTMLCleanStrategy } from '../strategies/denoise/HTMLCleanStrategy';
import { NavigationFilterStrategy } from '../strategies/denoise/NavigationFilterStrategy';
import { ChunkingStrategy } from '../strategies/semantic/ChunkingStrategy';
import { RelevanceFilterStrategy } from '../strategies/semantic/RelevanceFilterStrategy';
import { JSONSchemaStrategy } from '../strategies/output/JSONSchemaStrategy';
import { MarkdownStrategy } from '../strategies/output/MarkdownStrategy';
import { apiKeyAuth } from './middleware/auth';
import { validateRequest, processRequestSchema, feedbackRequestSchema } from './validators/process';
import type { ContentItem, ContentHint } from '../types';

export interface ApiConfig {
  pipeline?: Pipeline;
}

export function createRouter(config: ApiConfig = {}): Router {
  const router = Router();
  const pipeline = config.pipeline || createDefaultPipeline();

  // Health check - no auth required
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // API v1 routes - require authentication
  const apiV1 = Router();
  apiV1.use(apiKeyAuth());

  // POST /process - accepts base64 encoded content, returns processing result
  apiV1.post('/process', validateRequest(processRequestSchema), async (req: Request, res: Response) => {
    try {
      const { content, contentType } = req.body;

      // Decode base64 content
      let rawContent: Uint8Array;
      try {
        const decoded = Buffer.from(content, 'base64');
        rawContent = new Uint8Array(decoded);
      } catch {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid base64 content',
        });
        return;
      }

      // Detect content type
      const inputRegistry = new InputRegistry();
      inputRegistry.register(new HTMLInputSource());
      const hints: ContentHint = inputRegistry.detectMimeType(rawContent);

      // Create content item
      const contentItem: ContentItem = {
        id: `item-${Date.now()}`,
        source: contentType || hints.mimeType || 'unknown',
        raw: rawContent,
        meta: {
          textContent: Buffer.from(rawContent).toString('utf-8'),
          contentType: contentType || hints.mimeType,
        },
        hints,
      };

      // Process through pipeline
      const result = await pipeline.process(contentItem);

      res.json({
        success: true,
        result: {
          id: result.id,
          outcome: result.outcome,
          confidence: result.confidence,
          processingTimeMs: result.processingTimeMs,
          fusedOutput: result.fusedOutput,
          strategiesUsed: result.strategiesUsed.map((s: { strategyId: string; success: boolean; output?: unknown }) => ({
            strategyId: s.strategyId,
            success: s.success,
            output: s.output,
          })),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Processing Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /strategies - lists available strategies
  apiV1.get('/strategies', (_req: Request, res: Response) => {
    const strategies = pipeline.getRegisteredStrategies();

    res.json({
      success: true,
      strategies: strategies.map((s: Strategy) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        version: s.version,
        enabled: s.config.enabled,
        priority: s.config.priority,
      })),
    });
  });

  // POST /experience/feedback - records feedback
  apiV1.post('/experience/feedback', validateRequest(feedbackRequestSchema), (req: Request, res: Response) => {
    const { contentItemId, rating, feedback } = req.body;

    // Feedback recording - integrate with experience store if available
    // For now, just acknowledge receipt
    res.json({
      success: true,
      message: 'Feedback recorded',
      data: {
        contentItemId,
        rating,
        feedback,
        recordedAt: new Date().toISOString(),
      },
    });
  });

  router.use('/api/v1', apiV1);

  return router;
}

function createDefaultPipeline(): Pipeline {
  const pipeline = new Pipeline();
  const registry = new StrategyRegistry();

  // Register denoise strategies
  const htmlCleanStrategy = new HTMLCleanStrategy();
  registry.register(htmlCleanStrategy);
  pipeline.registerStrategy(htmlCleanStrategy);

  const navFilterStrategy = new NavigationFilterStrategy();
  registry.register(navFilterStrategy);
  pipeline.registerStrategy(navFilterStrategy);

  // Register semantic strategies
  const chunkingStrategy = new ChunkingStrategy();
  registry.register(chunkingStrategy);
  pipeline.registerStrategy(chunkingStrategy);

  const relevanceFilterStrategy = new RelevanceFilterStrategy();
  registry.register(relevanceFilterStrategy);
  pipeline.registerStrategy(relevanceFilterStrategy);

  // Register output strategies
  const jsonSchemaStrategy = new JSONSchemaStrategy();
  registry.register(jsonSchemaStrategy);
  pipeline.registerStrategy(jsonSchemaStrategy);

  const markdownStrategy = new MarkdownStrategy();
  registry.register(markdownStrategy);
  pipeline.registerStrategy(markdownStrategy);

  return pipeline;
}

// Extend Pipeline interface to expose strategies
declare module '../core/Pipeline' {
  interface Pipeline {
    getRegisteredStrategies(): Strategy[];
  }
}