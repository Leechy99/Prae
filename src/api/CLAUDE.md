# Module: src/api — REST API Layer

## Module Overview

Exposes the Prae pipeline via Express.js REST API. Handles HTTP request parsing, base64 content decoding, API key authentication, Zod-based validation, and routing to the Pipeline orchestrator.

## Public API

### Entry Point

```typescript
// src/api/index.ts
import { startServer } from './server';
import { getRuntimeConfig } from './config';
const config = getRuntimeConfig();
startServer(config.port).catch(err => { console.error('Failed to start server:', err); process.exit(1); });
```

### Runtime Configuration

```typescript
// src/api/config.ts
export interface RuntimeConfig {
  apiKey: string;
  env: string;
  isProduction: boolean;
  port: number;
}
export function getRuntimeConfig(env?: RuntimeEnv): RuntimeConfig
```

### App Factory & Server

```typescript
// src/api/server.ts
export function createApp(): Express
export function startServer(port: number): Promise<Express>
```

### Router Factory

```typescript
// src/api/routes.ts
export interface ApiConfig {
  pipeline?: Pipeline;
}
export function createRouter(config?: ApiConfig): Router
```

### Authentication Middleware

```typescript
// src/api/middleware/auth.ts
export interface ApiKeyAuthOptions {
  headerName?: string;  // default: 'X-API-Key'
  apiKey?: string;      // default: getRuntimeConfig().apiKey
}
export function apiKeyAuth(options?: ApiKeyAuthOptions): (req: Request, res: Response, next: NextFunction) => void
```

### Request Validators

```typescript
// src/api/validators/process.ts
export const processRequestSchema: z.ZodSchema   // { content: string, contentType?: string }
export const feedbackRequestSchema: z.ZodSchema  // { contentItemId: string, rating: 1-5, feedback?: string }
export type ProcessRequest = z.infer<typeof processRequestSchema>
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>
export function validateRequest(schema: z.ZodSchema): (req: Request, res: Response, next: NextFunction) => void
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Returns `{ status: 'ok', timestamp }` |
| `POST` | `/api/v1/process` | X-API-Key | Process base64-encoded content |
| `GET` | `/api/v1/strategies` | X-API-Key | List registered strategies |
| `POST` | `/api/v1/experience/feedback` | X-API-Key | Record feedback |

### POST /api/v1/process

**Request:**
```json
{ "content": "<base64>", "contentType": "text/html" }
```

**Response:**
```json
{
  "success": true,
  "result": {
    "id": "item-1234567890",
    "outcome": "SUCCESS",
    "confidence": { "overall": 0.92, ... },
    "processingTimeMs": 145,
    "fusedOutput": { ... },
    "strategiesUsed": [ ... ]
  }
}
```

## Key Types

```typescript
// src/api/routes.ts
export interface ApiConfig {
  pipeline?: Pipeline;
  inputRegistry?: InputRegistry;
  experienceStore?: ExperienceStore;
}

// src/api/middleware/auth.ts
export interface ApiKeyAuthOptions {
  headerName?: string;
  apiKey?: string;
}

// src/api/validators/process.ts
type ProcessRequest = { content: string; contentType?: string }
type FeedbackRequest = { contentItemId: string; rating: number; feedback?: string }
```

## Dependencies

| Dependency | Purpose | Source |
|-----------|---------|--------|
| `express` | HTTP server framework | package.json |
| `zod` | Request validation schemas | package.json |
| `@types/express` | TypeScript types | package.json |
| `Pipeline` | Core orchestrator | `../core/Pipeline` |
| `getRuntimeConfig` | Shared runtime config | `./config` |
| `Strategy` | Strategy interface | `../strategies/base/Strategy` |
| `StrategyRegistry` | Strategy registry | `../strategies/base/StrategyRegistry` |
| `InputRegistry` | Input source registry | `../input/InputRegistry` |
| `HTMLInputSource` | HTML parser | `../input/HTMLInputSource` |
| `HTMLCleanStrategy` | Denoise strategy | `../strategies/denoise/HTMLCleanStrategy` |
| `NavigationFilterStrategy` | Denoise strategy | `../strategies/denoise/NavigationFilterStrategy` |
| `ChunkingStrategy` | Semantic strategy | `../strategies/semantic/ChunkingStrategy` |
| `RelevanceFilterStrategy` | Semantic strategy | `../strategies/semantic/RelevanceFilterStrategy` |
| `JSONSchemaStrategy` | Output strategy | `../strategies/output/JSONSchemaStrategy` |
| `MarkdownStrategy` | Output strategy | `../strategies/output/MarkdownStrategy` |

## File Structure

```
src/api/
├── config.ts             # getRuntimeConfig(), production fail-fast validation
├── index.ts              # Server entry point
├── server.ts             # createApp(), startServer()
├── routes.ts             # createRouter(), route handlers, createDefaultPipeline()
├── middleware/
│   └── auth.ts           # apiKeyAuth() middleware factory
└── validators/
    └── process.ts        # Zod schemas, validateRequest()
```

## Mermaid Diagram — API Structure

```mermaid
graph LR
    A["index.ts\nserver entry"] --> Z["config.ts\ngetRuntimeConfig"]
    A --> B["server.ts\ncreateApp"]
    B --> C["routes.ts\ncreateRouter"]
    C --> D["middleware/auth.ts\napiKeyAuth"]
    D --> Z
    C --> E["validators/process.ts\nvalidateRequest"]
    C --> F["POST /process\n-> Pipeline.process()"]
    C --> G["GET /strategies\npipeline.getRegisteredStrategies()"]
    C --> H["POST /experience/feedback"]
```

## Important Implementation Details

### Default Pipeline Setup

`createDefaultPipeline()` registers strategies in this order:

| Phase | Strategy | Priority |
|-------|----------|----------|
| DENOISE | `HTMLCleanStrategy` | 100 |
| DENOISE | `NavigationFilterStrategy` | 90 |
| SEMANTIC | `ChunkingStrategy` | 100 |
| SEMANTIC | `RelevanceFilterStrategy` | 90 |
| OUTPUT | `JSONSchemaStrategy` | 50 |
| OUTPUT | `MarkdownStrategy` | 50 |

### Processing Flow

1. Receive `{ content: base64String, contentType?: string }`
2. Decode base64 to `Uint8Array`
3. `InputRegistry.detectMimeType()` identifies content type
4. Construct `ContentItem` and call `Pipeline.process()`
5. Return `{ success, result: { id, outcome, confidence, processingTimeMs, fusedOutput, strategiesUsed } }`

### Authentication Flow

1. All `/api/v1/*` routes require `X-API-Key` header
2. Key validated against `getRuntimeConfig().apiKey`, unless `apiKeyAuth({ apiKey })` overrides it
3. Missing header returns `401 Unauthorized`
4. Invalid key returns `403 Forbidden`

### Runtime Configuration Flow

1. `getRuntimeConfig()` reads `NODE_ENV`, `PORT`, and `API_KEY`
2. Local development defaults to `NODE_ENV=development`, `PORT=3000`, and `API_KEY=dev-api-key`
3. Playwright uses the same parser and supplies test defaults (`NODE_ENV=test`, `API_KEY=test-api-key`)
4. Production requires explicit `API_KEY` and `PORT`; missing or invalid values throw during startup

### Known Issues

- No rate limiting on endpoints
- Request body size limit: 10mb

## Testing

| Test File | Scope |
|-----------|-------|
| `tests/unit/api/config.test.ts` | Runtime config defaults, env overrides, production fail-fast, port validation |
| `tests/unit/api/routes.test.ts` | All endpoints, auth middleware, validation |
| `tests/e2e/processing.spec.ts` | Full HTTP round-trip with Playwright |

## Related Files

| Path | Purpose |
|------|---------|
| `./config.ts` | Shared API runtime configuration |
| `../core/Pipeline.ts` | Pipeline orchestrator |
| `../input/InputRegistry.ts` | MIME detection |
| `../strategies/base/Strategy.ts` | Strategy interface |
| `../../CLAUDE.md` | Root documentation |

## Changelog

- **2026-04-23 16:11:05** — Updated module documentation with complete API signatures, endpoint tables, and dependency matrix
- **2026-04-23** — Updated to new format with Mermaid diagram, complete API signatures, dependency table
- **2026-06-03** — Documented shared runtime config, production fail-fast behavior, and config tests
