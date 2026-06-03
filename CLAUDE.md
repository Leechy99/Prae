# Prae — Intelligent Noise Removal + Semantic Extraction Platform

**Version:** 0.1.0
**Generated:** 2026-04-23T16:11:05

---

## Changelog

### 2026-04-23 — Initial scan
- Root CLAUDE.md and module CLAUDE.md files generated
- Full project inventory completed (Phase A/B/C)
- Coverage report: 21 source files, 26 test files, 80% coverage threshold enforced

### 2026-06-03 — Experience persistence
- `LocalExperienceStore` gained optional JSON file persistence
- Default API feedback storage now survives server restarts via `data/experience-store.json`
- `PRAE_EXPERIENCE_STORE_PATH` can override the runtime persistence file

---

## Project Vision

Prae is an **intelligent noise removal + semantic extraction platform** that transforms raw HTML/content into LLM-friendly JSON/Markdown. It uses a multi-strategy pipeline approach with pluggable input sources, denoise/semantic/output strategies, confidence scoring, and local experience storage for learning.

**Target users:** AI Agent developers, RAG system builders, data engineers, LLM application teams.

---

## Architecture Overview

```mermaid
graph TD
    A["(root) Prae"] --> B["src/api"]
    A --> C["src/core"]
    A --> D["src/experience"]
    A --> E["src/input"]
    A --> F["src/strategies"]
    A --> G["src/types"]

    F --> F1["strategies/base"]
    F --> F2["strategies/denoise"]
    F --> F3["strategies/semantic"]
    F --> F4["strategies/output"]

    click B "./src/api/CLAUDE.md" "View API module docs"
    click C "./src/core/CLAUDE.md" "View Core module docs"
    click D "./src/experience/CLAUDE.md" "View Experience module docs"
    click E "./src/input/CLAUDE.md" "View Input module docs"
    click F "./src/strategies/CLAUDE.md" "View Strategies module docs"
    click G "./src/types/CLAUDE.md" "View Types module docs"

    click F1 "./src/strategies/base/CLAUDE.md" "View base strategies docs"
    click F2 "./src/strategies/denoise/CLAUDE.md" "View denoise strategies docs"
    click F3 "./src/strategies/semantic/CLAUDE.md" "View semantic strategies docs"
    click F4 "./src/strategies/output/CLAUDE.md" "View output strategies docs"
```

---

## Module Index

| Module | Path | Responsibility | Language |
|--------|------|---------------|----------|
| **API** | `src/api/` | REST API layer (Express) — routes, middleware, validation | TypeScript |
| **Core** | `src/core/` | Pipeline orchestrator, ConfidenceScorer | TypeScript |
| **Experience** | `src/experience/` | ExperienceStore for learning from processing results | TypeScript |
| **Input** | `src/input/` | InputSource plugin system (HTMLInputSource) | TypeScript |
| **Strategies** | `src/strategies/` | Strategy base + denoise/semantic/output strategies | TypeScript |
| **Types** | `src/types/` | Shared TypeScript interfaces | TypeScript |

---

## Directory Tree

```
src/
├── api/                    # REST API layer
│   ├── index.ts            # Entry point (starts server)
│   ├── server.ts           # Express app factory
│   ├── routes.ts           # Route definitions (/process, /strategies, /experience/feedback)
│   ├── middleware/auth.ts  # API key auth middleware
│   └── validators/process.ts # Zod schemas for request validation
├── core/                   # Core pipeline
│   ├── Pipeline.ts         # Main orchestrator (DENOISE→SEMANTIC→OUTPUT)
│   └── ConfidenceScorer.ts # Confidence scoring with thresholds
├── experience/             # Learning system
│   ├── ExperienceRecord.ts # Record type definitions
│   └── ExperienceStore.ts  # Local store with optional JSON persistence
├── input/                  # Input source plugins
│   ├── InputSource.ts      # Base interface
│   ├── HTMLInputSource.ts  # HTML parser (jsdom)
│   └── InputRegistry.ts    # Source registry + MIME detection
├── strategies/             # Strategy plugins
│   ├── base/
│   │   ├── Strategy.ts         # Base interface (id, name, type, execute)
│   │   ├── StrategyRegistry.ts  # Registry with priority/type queries
│   │   └── StrategyExecutor.ts # Execution engine + result fusion
│   ├── denoise/
│   │   ├── HTMLCleanStrategy.ts       # Removes scripts, styles, ads, nav
│   │   └── NavigationFilterStrategy.ts # Removes nav/header/footer/aside
│   ├── semantic/
│   │   ├── ChunkingStrategy.ts        # Sentence-based chunking (512 char target)
│   │   └── RelevanceFilterStrategy.ts  # Paragraph filtering + dedup (Jaccard)
│   └── output/
│       ├── JSONSchemaStrategy.ts  # Structured JSON output
│       └── MarkdownStrategy.ts     # Markdown output with title heading
└── types/
    └── index.ts            # ContentItem, ProcessingResult, ConfidenceScore, etc.

tests/
├── unit/                   # Jest unit tests
│   ├── api/routes.test.ts
│   ├── core/Pipeline.test.ts, ConfidenceScorer.test.ts
│   ├── experience/ExperienceStore.test.ts
│   ├── input/HTMLInputSource.test.ts
│   └── strategies/StrategyExecutor.test.ts, denoise.test.ts, semantic.test.ts, output.test.ts
└── e2e/
    └── processing.spec.ts  # Playwright E2E tests

docs/superpowers/
├── specs/2026-04-22-prae-design.md   # Full design specification
└── plans/2026-04-22-prae-mvp.md      # MVP implementation plan
```

---

## Running & Development

### Install dependencies
```bash
npm install
```

### Build
```bash
npm run build   # tsc → dist/
```

### Run
```bash
npm start       # node dist/api/index.js (default port 3000)
```

### Test
```bash
npm test              # Jest unit tests
npx playwright test   # Playwright E2E tests
```

### Lint
```bash
npm run lint    # tsc --noEmit
```

---

## Test Strategy

- **Framework:** Jest (unit) + Playwright (E2E)
- **Coverage threshold:** 80% (branches, functions, lines, statements)
- **Unit tests:** 26 test files covering all modules
- **E2E tests:** 3 Playwright specs for API health, processing, auth
- **Test config:** `jest.config.js` maps `src/` and `tests/` roots with `ts-jest` preset
- **E2E config:** `playwright.config.ts` targets `http://localhost:3000`

---

## Coding Standards

- **Language:** TypeScript 5.3, strict mode, ES2022 target
- **Module system:** CommonJS (Node.js)
- **Immutability:** Strategies return new objects; Pipeline merges output without mutation
- **Error handling:** All async execute() calls wrapped in try/catch, returning `StrategyExecution` with `success: false`
- **Naming:** camelCase (variables/functions), PascalCase (types/interfaces/classes)
- **Strategy interface:** `canApply(item)` guards `execute(item)`; both must be implemented

---

## AI Usage Guidelines

- Use **planner** agent for feature implementation planning
- Use **code-reviewer** agent after writing code
- Use **tdd-guide** agent for new features (write tests first)
- Use **security-reviewer** agent before commits involving auth/input validation
- Refer to `C:/Users/17775/.claude/rules/` for full skill set

---

## Design Docs

- **Project overview:** `docs/project-overview.md`
- **Full design:** `docs/superpowers/specs/2026-04-22-prae-design.md`
- **MVP plan:** `docs/superpowers/plans/2026-04-22-prae-mvp.md`

---

## Implementation Notes

### Recently addressed

1. `feedbackRequestSchema` is exported from `src/api/validators/process.ts`.
2. `apiKeyAuth()` is used as a middleware factory and matches the implementation in `src/api/middleware/auth.ts`.
3. `/api/v1/process` uses `InputRegistry` / `HTMLInputSource` for parsing and returns `contentItemId`.
4. Pipeline now merges stage outputs between DENOISE, SEMANTIC, and OUTPUT, so `filteredText` and `chunks` can reach output strategies.
5. `/api/v1/experience/feedback` writes feedback to `ExperienceStore` by `contentItemId`.
6. `LocalExperienceStore` supports optional JSON persistence; the default API store writes to `data/experience-store.json`, or `PRAE_EXPERIENCE_STORE_PATH` when set.

### Remaining gaps

1. **API `index.ts` entry** — `src/api/index.ts` is the server entry, not `src/api/server.ts` as the MVP plan intended.
2. **No `.env` / env-based config** — API key still falls back to `dev-api-key` in `auth.ts`; production should require explicit configuration.
3. **No CI/CD pipeline** — `.github/workflows/` is not present.
4. **Input coverage** — currently focused on HTML; document, audio, and enterprise knowledge sources remain design-stage capabilities.
