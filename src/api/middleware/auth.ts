import { Request, Response, NextFunction } from 'express';

const API_KEY = process.env.API_KEY || 'dev-api-key';

export interface ApiKeyAuthOptions {
  headerName?: string;
  apiKey?: string;
}

export function apiKeyAuth(options: ApiKeyAuthOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const headerName = options.headerName || 'X-API-Key';
  const validApiKey = options.apiKey || API_KEY;

  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers[headerName.toLowerCase()] as string | undefined;

    if (!apiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: `Missing ${headerName} header`,
      });
      return;
    }

    if (apiKey !== validApiKey) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid API key',
      });
      return;
    }

    next();
  };
}