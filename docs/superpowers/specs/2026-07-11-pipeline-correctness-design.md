# Prae Pipeline Correctness Design

**Date:** 2026-07-11
**Status:** Approved for planning
**Scope:** Core pipeline correctness, confidence consistency, meaningful retries, feedback correctness, and quality gates

## 1. Goal

Make every Prae processing result internally consistent, reproducible, and testable while preserving the current public API response shape. This iteration focuses on the correctness foundation required before adding more input types, semantic models, or production infrastructure.

## 2. Non-goals

This iteration does not add SQLite/PostgreSQL storage, new document formats, model-backed entity extraction, rate limiting, OpenAPI generation, Docker packaging, or a CI provider workflow. Those remain follow-up projects after the pipeline has a reliable quality baseline.

## 3. Current Problems

1. Strategies in the same stage execute against the same pre-stage `ContentItem`, so a later denoise or semantic strategy cannot consume an earlier strategy's output.
2. Intermediate output is shallow-merged through a hard-coded key list, leaving the pipeline vulnerable to dropped fields and inconsistent text/chunk pairs.
3. Output strategies write a default confidence of `0.8` before the pipeline calculates the final confidence.
4. Deterministic retries repeat the same pipeline against a mutated input and do not change the strategy set or parameters.
5. Semantic strategies use a fixed 100-character applicability threshold and English-oriented splitting/token estimation, causing short Chinese content to skip semantic processing.
6. Feedback for an unknown `contentItemId` is silently accepted.
7. The configured 80% coverage threshold is not exercised by the default test command, and the Playwright command does not exit reliably after its tests pass.

## 4. Chosen Architecture

### 4.1 Normalized pipeline state

Introduce a typed `PipelineState` owned by the core pipeline. It contains the latest canonical text plus known processing artifacts and metadata:

```ts
interface PipelineState {
  contentItem: ContentItem;
  text: string;
  cleanedText?: string;
  filteredText?: string;
  chunks?: Chunk[];
  totalChunks?: number;
  metrics: Record<string, number>;
  semantic: {
    entities?: unknown[];
    mentions?: unknown[];
    namedEntities?: unknown[];
    structure?: Record<string, unknown>;
    relevance?: number;
    coherence?: number;
    context?: string;
  };
  strategiesApplied: string[];
  confidence?: ConfidenceScore;
}
```

The existing `ContentItem.meta` remains available for API compatibility, but strategy-to-strategy flow is mediated by explicit state conversion and merge functions rather than ad hoc writes throughout `Pipeline`.

### 4.2 Stage execution semantics

DENOISE and SEMANTIC are transformation stages. Their strategies run by priority, one at a time. After each successful strategy, its output is merged into `PipelineState`, and the next strategy receives a `ContentItem` projected from that updated state.

OUTPUT strategies are independent renderers. They all read the same finalized state and may still run as a group, producing the existing fused output envelope when more than one renderer succeeds.

This distinction guarantees that:

- later denoise strategies see earlier cleaning results;
- chunking sees the final filtered text;
- chunks and rendered text come from the same canonical state;
- renderer execution cannot mutate the state used for confidence scoring.

### 4.3 Typed strategy outputs

Define a `StrategyOutput` union for the known stage outputs. Strategy executions remain backward-compatible at the public type boundary, but core merge logic accepts only recognized output shapes and ignores no successful field silently. Unsupported output shapes are preserved in execution diagnostics without mutating canonical state.

The navigation strategy must return `cleanedText` in addition to `navRemoved` and `textLength`.

### 4.4 Confidence timing and consistency

Confidence is calculated after DENOISE and SEMANTIC transformations and before OUTPUT rendering. Output-strategy success is not used as evidence for content quality. The final score is placed in `PipelineState.confidence`, projected to `ContentItem.meta.confidence`, and consumed by every renderer.

The API-level `result.confidence`, JSON output confidence, and Markdown output confidence must be identical.

This iteration also makes the text-quality heuristic language-neutral by removing the English upper/lowercase requirement. Length, non-whitespace density, punctuation, and successful semantic artifacts remain deterministic inputs. Full statistical calibration is deferred to the quality-corpus project.

### 4.5 Meaningful retry policy

Retries are opt-in through a `RetryPolicy` abstraction:

```ts
interface RetryPolicy {
  canRetry(result: ProcessingResult, nextAttempt: number): boolean;
  prepareAttempt(original: ContentItem, nextAttempt: number): ContentItem;
}
```

The default policy does not repeat deterministic low-confidence processing. A configured policy may change strategy parameters or input metadata for the next attempt. Every attempt starts from a fresh clone of the original content item, so stage mutations cannot leak across attempts.

Thrown transient failures may still be retried only when the configured policy authorizes them. `retryCount` reports actual additional attempts.

### 4.6 Short and multilingual content

Semantic applicability is based on non-empty canonical text, not a fixed 100-character threshold. Chunking supports punctuation used in Chinese sentences and creates a valid single chunk for short text. Token estimates remain explicitly approximate, using separate handling for CJK characters and whitespace-delimited words.

Relevance filtering must not erase a valid short document merely because every paragraph is shorter than the existing paragraph threshold. For short documents it returns the canonical text unchanged with a zero removal ratio.

### 4.7 Feedback correctness

`ExperienceStore.addHumanFeedback` returns whether a matching record was updated. The API returns `404` with a stable error response when no record matches the supplied `contentItemId`. Existing successful feedback behavior and persistence remain unchanged.

### 4.8 Quality gates and E2E lifecycle

The default unit-test command collects coverage and enforces the existing global 80% thresholds. A separate fast test command may remain available for local iteration.

The Playwright web server must terminate with the test runner. Server startup returns the actual HTTP server handle, and the API entry point closes that handle on `SIGINT` and `SIGTERM` before exiting. E2E assertions are strengthened to verify cleaned output, semantic execution for short multilingual content, and confidence consistency rather than only checking field presence.

## 5. Data Flow

```text
raw request
  -> InputRegistry.parse
  -> PipelineState.fromContentItem
  -> sequential DENOISE transforms
  -> sequential SEMANTIC transforms
  -> ConfidenceScorer.calculateScore
  -> PipelineState.confidence
  -> independent OUTPUT renderers
  -> ProcessingResult
  -> ExperienceStore.recordProcessing
```

When an authorized retry policy requests another attempt, the flow restarts from a clone of the original parsed item with policy-provided metadata or configuration changes.

## 6. Error Handling

- A strategy-returned failure is retained in `strategiesUsed`; later strategies continue so independent cleanup can still succeed.
- A thrown strategy error is converted to a failed execution with its original timing information.
- No successful renderer produces a failed fused-output envelope.
- Experience persistence failures remain non-fatal to content processing, but are exposed through an injectable diagnostic callback instead of disappearing silently.
- Unknown feedback targets return `404`; invalid feedback payloads remain `400`.

## 7. Compatibility

- Existing endpoints and top-level response fields remain unchanged.
- Existing strategy identifiers and priorities remain unchanged.
- Existing `ContentItem.meta` fields continue to be populated for consumers.
- The `startServer` return type may change from `Promise<Express>` to a server handle containing both `app` and `server`; only the API entry point and tests currently consume it.
- Default deterministic retries change from repeated attempts to one attempt. This is an intentional correctness change because repeated identical processing provides no recovery value.

## 8. Testing Strategy

Implementation follows red-green-refactor. Required regression coverage includes:

1. Each transform strategy receives the previous successful strategy's canonical text.
2. Chunk text is derived from filtered text.
3. Navigation filtering returns and propagates cleaned text.
4. API confidence equals confidence embedded in every renderer output.
5. Output-strategy success does not inflate content confidence.
6. The default pipeline does not retry an unchanged deterministic attempt.
7. A custom retry policy receives a pristine original item and can authorize a changed attempt.
8. Short Chinese content reaches semantic processing and produces at least one chunk.
9. Relevance filtering preserves a valid short document.
10. Unknown feedback returns `404`; known feedback still persists.
11. Unit coverage meets all configured 80% thresholds.
12. Playwright completes, reports all tests, and exits successfully.

## 9. Success Criteria

- `npm run lint` succeeds.
- The default unit-test command succeeds with branches, functions, lines, and statements all at or above 80%.
- `npm run test:e2e` exits with code 0 without an external timeout.
- A multilingual short-content E2E fixture executes semantic processing.
- All confidence values exposed for one processing result are identical.
- No default retry repeats an unchanged deterministic pipeline.
- The public API remains backward-compatible except for the intentional `404` on feedback targets that do not exist.

## 10. Follow-up Projects

After this design is implemented, the next independent projects are:

1. A curated multilingual quality corpus and calibrated confidence model.
2. Production API hardening: strict Base64 validation, decoded-size limits, configuration validation, rate limiting, structured logs, and tenant-bound authorization.
3. SQLite/PostgreSQL experience persistence and content-hash historical lookup.
4. CI, container packaging, OpenAPI documentation, and operational metrics.
5. New semantic strategies and additional input-source plugins.
