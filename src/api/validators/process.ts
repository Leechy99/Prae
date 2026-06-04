import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const processRequestSchema = z.object({
  content: z.string(),
  contentType: z.string().optional(),
});

export type ProcessRequest = z.infer<typeof processRequestSchema>;

export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: 'Validation Error',
        message: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
      return;
    }

    next();
  };
}

export const feedbackRequestSchema = z.object({
  contentItemId: z.string(),
  rating: z.number().min(1).max(5),
  feedback: z.string().optional(),
});

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

export const experienceQuerySchema = z.object({
  filter: z.enum(['recent', 'learnable']).default('recent'),
  tenantId: z.string().min(1).optional(),
  sourceType: z.string().min(1).optional(),
  outcome: z.enum(['SUCCESS', 'RETRY_SUCCESS', 'CLOUD_ESCALATED', 'HUMAN_INTERVENTION', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExperienceQuery = z.infer<typeof experienceQuerySchema>;
