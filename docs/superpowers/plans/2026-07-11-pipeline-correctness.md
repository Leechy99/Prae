# Pipeline Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Prae processing results internally consistent, multilingual-short-text friendly, meaningfully retryable, and protected by reliable test gates without breaking the existing API response shape.

**Architecture:** Add an immutable, typed `PipelineState` between strategies. DENOISE and SEMANTIC strategies transform that state sequentially; confidence is calculated from the finalized transformation state; OUTPUT strategies render the same scored state independently. Retries are opt-in through a policy and always start from a pristine clone.

**Tech Stack:** TypeScript 5.3, Node.js 20, Express 4, Jest/ts-jest, Supertest, Playwright.

## Global Constraints

- Preserve existing endpoints, strategy IDs, priorities, and top-level API response fields.
- Preserve existing `ContentItem.meta` fields for external consumers while routing internal flow through typed state.
- Use red-green-refactor: no production change before a test has failed for the intended reason.
- Keep the existing 80% global thresholds for branches, functions, lines, and statements; do not exclude additional source files from coverage.
- Default deterministic processing performs one attempt; extra attempts require an injected `RetryPolicy`.
- JSON, Markdown, and API-level confidence for a processing result must be identical.
- Do not add runtime dependencies in this iteration.

---

### Task 1: Add the normalized pipeline state boundary

**Files:**
- Create: `src/core/PipelineState.ts`
- Create: `src/strategies/base/StrategyOutput.ts`
- Create: `tests/unit/core/PipelineState.test.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: existing `ContentItem`, `ConfidenceScore`, and strategy output objects.
- Produces: `StrategyOutput`, `PipelineState`, `createPipelineState(item)`, `mergeStrategyOutput(state, output)`, and `projectContentItem(state)`.

- [ ] **Step 1: Write failing state tests**

Create tests proving canonical-text precedence and immutable projection:

```ts
import {
  createPipelineState,
  mergeStrategyOutput,
  projectContentItem,
} from '../../../src/core/PipelineState';
import type { ContentItem } from '../../../src/types';

const item: ContentItem = {
  id: 'item-1',
  source: 'HTMLInputSource',
  raw: new TextEncoder().encode('<p>raw</p>'),
  meta: { textContent: 'raw text', title: 'Title' },
  hints: { mimeType: 'text/html' },
};

test('uses filtered text as canonical text and preserves chunks', () => {
  const initial = createPipelineState(item);
  const cleaned = mergeStrategyOutput(initial, { cleanedText: 'cleaned', removedTags: 2 });
  const filtered = mergeStrategyOutput(cleaned, { filteredText: 'filtered', removedRatio: 0.25 });
  const chunked = mergeStrategyOutput(filtered, {
    chunks: [{ id: 'c1', index: 0, text: 'filtered', startChar: 0, endChar: 8, tokenEstimate: 2 }],
    totalChunks: 1,
  });

  expect(chunked.text).toBe('filtered');
  expect(chunked.metrics).toMatchObject({ removedTags: 2, removedRatio: 0.25 });
  expect(projectContentItem(chunked).meta).toMatchObject({
    textContent: 'filtered',
    cleanedText: 'cleaned',
    filteredText: 'filtered',
    totalChunks: 1,
  });
  expect(item.meta).toEqual({ textContent: 'raw text', title: 'Title' });
});

test('does not mutate canonical state for unsupported outputs', () => {
  const initial = createPipelineState(item);
  expect(mergeStrategyOutput(initial, { customRenderer: true })).toEqual(initial);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm.cmd test -- --runInBand tests/unit/core/PipelineState.test.ts`

Expected: FAIL because `src/core/PipelineState.ts` does not exist.

- [ ] **Step 3: Add state and recognized output types**

Add `ContentChunk`, `PipelineMetrics`, `PipelineSemanticState`, `PipelineState`, and the three exported functions. Add a discriminated `StrategyOutput` union covering text/document transforms, chunks, metrics, and semantic fields. `mergeStrategyOutput` must return a new object, recognize `document`, `cleanedText`, `textContent`, `filteredText`, `chunks`, `totalChunks`, numeric metrics, and semantic fields, and return the original state reference if no recognized field exists. `projectContentItem` must create fresh `raw`, `hints`, and `meta` values and set canonical fields from state.

`PipelineState` includes `document?: string` so real HTML denoise strategies can pass a cleaned DOM representation forward instead of reparsing the original raw bytes.

Use this public shape in `src/types/index.ts`:

```ts
export interface ContentChunk {
  id: string;
  index: number;
  text: string;
  startChar: number;
  endChar: number;
  tokenEstimate: number;
}
```

- [ ] **Step 4: Run focused tests and refactor**

Run: `npm.cmd test -- --runInBand tests/unit/core/PipelineState.test.ts`

Expected: PASS with no mutation of the fixture.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/core/PipelineState.ts src/strategies/base/StrategyOutput.ts src/types/index.ts tests/unit/core/PipelineState.test.ts
git commit -m "refactor: add typed pipeline state"
```

---

### Task 2: Execute transforms sequentially and render scored state

**Files:**
- Modify: `src/core/Pipeline.ts`
- Modify: `src/strategies/denoise/NavigationFilterStrategy.ts`
- Modify: `src/strategies/denoise/HTMLCleanStrategy.ts`
- Modify: `src/strategies/output/JSONSchemaStrategy.ts`
- Modify: `src/strategies/output/MarkdownStrategy.ts`
- Modify: `tests/unit/core/Pipeline.test.ts`
- Modify: `tests/unit/strategies/denoise.test.ts`
- Modify: `tests/unit/strategies/output.test.ts`

**Interfaces:**
- Consumes: Task 1 state functions.
- Produces: sequential DENOISE/SEMANTIC execution; renderer input containing final confidence; navigation output containing `cleanedText`.

- [ ] **Step 1: Write failing sequential-flow tests**

Add pipeline tests with two custom DENOISE strategies. The first returns `{ cleanedText: 'first transform' }`; the second records `item.meta.textContent` and returns `{ cleanedText: 'second transform' }`. Assert the second receives `first transform`.

Add a SEMANTIC filter returning `{ filteredText: 'filtered canonical text' }` followed by a chunker that records its input. Assert the chunker receives `filtered canonical text`.

Add renderer assertions:

```ts
const result = await pipeline.process(contentItem);
const rendered = result.fusedOutput as { type: 'fused'; data: Array<{ metadata: { confidence: number } }> };
expect(rendered.data.every(output => output.metadata.confidence === result.confidence.overall)).toBe(true);
```

Add a denoise test asserting `NavigationFilterStrategy.execute()` returns `output.cleanedText` without navigation text.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --runInBand tests/unit/core/Pipeline.test.ts tests/unit/strategies/denoise.test.ts tests/unit/strategies/output.test.ts`

Expected: FAIL because transforms currently share pre-stage input, navigation omits `cleanedText`, and renderers use a fallback confidence.

- [ ] **Step 3: Implement sequential transformation stages**

Refactor `Pipeline.executePipelineWithRetry` into these private operations:

```ts
private async executeTransformStage(
  state: PipelineState,
  type: StrategyType.DENOISE | StrategyType.SEMANTIC
): Promise<{ state: PipelineState; executions: StrategyExecution[] }>;

private async executeOutputStage(
  state: PipelineState
): Promise<PipelineExecutedStrategies>;
```

`executeTransformStage` iterates `registry.listByPriority(type)`, projects the latest state before `canApply` and `execute`, preserves the execution's actual ID/timestamps, merges only successful output, and appends successful IDs to `strategiesApplied`.

After both transform stages, calculate confidence from their executions only, set `state.confidence`, project it to `meta.confidence`, then execute OUTPUT strategies. Append output executions to the public `strategiesUsed` only after scoring.

Remove the old module augmentation at the end of `src/api/routes.ts`; `Pipeline.getRegisteredStrategies()` already exists as a real method.

- [ ] **Step 4: Fix renderer and navigation contracts**

Return `{ document: document.documentElement.outerHTML, cleanedText, navRemoved, textLength }` from navigation. Make `HTMLCleanStrategy` parse `String(item.meta.document)` when present, fall back to decoding `item.raw`, and return its updated `document` with `cleanedText`; this ensures the real denoise strategies—not only test doubles—are actually chained. In both renderers replace fallback confidence with the scored value:

```ts
const confidence = typeof item.meta?.confidence === 'number'
  ? item.meta.confidence
  : 0;
```

- [ ] **Step 5: Run focused and complete unit tests**

Run: `npm.cmd test -- --runInBand tests/unit/core/Pipeline.test.ts tests/unit/strategies/denoise.test.ts tests/unit/strategies/output.test.ts`

Then: `npm.cmd run lint`

Expected: focused tests and TypeScript checks PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/core/Pipeline.ts src/api/routes.ts src/strategies/denoise/NavigationFilterStrategy.ts src/strategies/denoise/HTMLCleanStrategy.ts src/strategies/output/JSONSchemaStrategy.ts src/strategies/output/MarkdownStrategy.ts tests/unit/core/Pipeline.test.ts tests/unit/strategies/denoise.test.ts tests/unit/strategies/output.test.ts
git commit -m "fix: make pipeline stages sequential and confidence consistent"
```

---

### Task 3: Replace deterministic retries with an opt-in retry policy

**Files:**
- Create: `src/core/RetryPolicy.ts`
- Modify: `src/core/Pipeline.ts`
- Modify: `tests/unit/core/Pipeline.test.ts`

**Interfaces:**
- Produces: `RetryPolicy.canRetry(result, nextAttempt)` and `RetryPolicy.prepareAttempt(original, nextAttempt)`; optional `PipelineConfig.retryPolicy`.

- [ ] **Step 1: Write failing retry tests**

Add one test with a low-confidence deterministic strategy and `maxRetries: 3`; assert its execution count is one and `retryCount` is zero when no policy is supplied.

Add one test with this policy:

```ts
const retryPolicy: RetryPolicy = {
  canRetry: (_result, nextAttempt) => nextAttempt === 1,
  prepareAttempt: (original, nextAttempt) => ({
    ...original,
    raw: original.raw.slice(),
    meta: { ...original.meta, retryVariant: nextAttempt },
    hints: { ...original.hints },
  }),
};
```

Mutate the first attempt's metadata inside a strategy, then assert the second attempt sees `retryVariant: 1` but not the first attempt's mutation. Assert `retryCount === 1`.

- [ ] **Step 2: Run retry tests and verify RED**

Run: `npm.cmd test -- --runInBand tests/unit/core/Pipeline.test.ts -t "retry"`

Expected: FAIL because the current pipeline repeats automatically and reuses the mutated item.

- [ ] **Step 3: Implement retry policy and pristine cloning**

Create:

```ts
export interface RetryPolicy {
  canRetry(result: ProcessingResult, nextAttempt: number): boolean;
  prepareAttempt(original: ContentItem, nextAttempt: number): ContentItem;
}
```

Store a pristine clone at the start of `process`. After an unsuccessful result, retry only when `retryCount < maxRetries`, a policy exists, and `policy.canRetry(result, retryCount + 1)` is true. Pass a fresh clone to `prepareAttempt`. Apply the same rule to a failed result created from a thrown pipeline error.

- [ ] **Step 4: Verify retry and pipeline suites**

Run: `npm.cmd test -- --runInBand tests/unit/core/Pipeline.test.ts`

Expected: PASS; default attempts once, custom policy performs exactly one changed retry.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/core/RetryPolicy.ts src/core/Pipeline.ts tests/unit/core/Pipeline.test.ts
git commit -m "fix: make pipeline retries policy driven"
```

---

### Task 4: Preserve short multilingual content through semantic processing

**Files:**
- Modify: `src/strategies/semantic/ChunkingStrategy.ts`
- Modify: `src/strategies/semantic/RelevanceFilterStrategy.ts`
- Modify: `src/core/ConfidenceScorer.ts`
- Modify: `tests/unit/strategies/semantic.test.ts`
- Modify: `tests/unit/core/ConfidenceScorer.test.ts`

**Interfaces:**
- Consumes: canonical `filteredText ?? cleanedText ?? textContent` projected by Task 1.
- Produces: at least one chunk for non-empty short content and language-neutral text-quality scoring.

- [ ] **Step 1: Write failing multilingual tests**

Add semantic tests using `这是一个简短但有效的中文句子。它应该进入语义处理！` and assert both strategies can apply, relevance returns the original text with `removedRatio: 0`, and chunking returns at least one chunk.

Add a chunk-boundary test using `第一句。第二句！第三句？` and assert sentence punctuation is retained and ordering is stable.

Add confidence tests proving non-empty Chinese text receives a positive format contribution without requiring Latin upper/lowercase. Pipeline coverage from Task 2 remains responsible for proving renderer executions are excluded from scoring.

- [ ] **Step 2: Run semantic/scorer tests and verify RED**

Run: `npm.cmd test -- --runInBand tests/unit/strategies/semantic.test.ts tests/unit/core/ConfidenceScorer.test.ts`

Expected: FAIL on the 100-character applicability threshold, short-paragraph removal, and English-specific format heuristic.

- [ ] **Step 3: Implement language-neutral semantic behavior**

Use canonical text precedence in both strategies. Change `canApply` to `text.trim().length > 0`. Split sentences after ASCII or CJK terminators with optional whitespace. Estimate tokens as `ceil(cjkCharacters + latinWordCharacters / 4)`, with a minimum of one for non-empty text.

In relevance filtering, if every non-empty paragraph is shorter than `MIN_PARAGRAPH_LENGTH`, return the original text and zero removal ratio. Keep existing duplicate filtering for longer documents.

Replace uppercase/lowercase checks in `ConfidenceScorer.calculateTextQuality` with printable-density and sentence-punctuation checks that work for Latin and CJK text. Keep the final score clamped to `[0, 1]`.

- [ ] **Step 4: Verify semantic, scorer, and pipeline suites**

Run: `npm.cmd test -- --runInBand tests/unit/strategies/semantic.test.ts tests/unit/core/ConfidenceScorer.test.ts tests/unit/core/Pipeline.test.ts`

Expected: PASS for short Chinese content and existing English fixtures.

- [ ] **Step 5: Commit Task 4**

```powershell
git add src/strategies/semantic/ChunkingStrategy.ts src/strategies/semantic/RelevanceFilterStrategy.ts src/core/ConfidenceScorer.ts tests/unit/strategies/semantic.test.ts tests/unit/core/ConfidenceScorer.test.ts
git commit -m "feat: support short multilingual semantic processing"
```

---

### Task 5: Reject feedback for unknown experience records

**Files:**
- Modify: `src/experience/ExperienceStore.ts`
- Modify: `src/core/Pipeline.ts`
- Modify: `src/api/routes.ts`
- Modify: `tests/unit/experience/ExperienceStore.test.ts`
- Modify: `tests/unit/api/routes.test.ts`

**Interfaces:**
- Changes `ExperienceStore.addHumanFeedback(...)` from `Promise<void>` to `Promise<boolean>`.
- Adds optional `PipelineConfig.onDiagnostic?: (event: PipelineDiagnostic) => void` for non-fatal experience-store errors.
- API returns `404 { error: 'Experience Record Not Found', message: 'No experience record matches the supplied contentItemId' }` when false.

- [ ] **Step 1: Write failing store and route tests**

Add a store test asserting unknown feedback resolves to `false` and known feedback resolves to `true`. Update the configured mock store to return `true` for successful route tests. Add:

```ts
it('returns 404 when feedback target does not exist', async () => {
  const response = await request(app)
    .post('/api/v1/experience/feedback')
    .set('X-API-Key', 'dev-api-key')
    .send({ contentItemId: 'missing-item', rating: 4 });

  expect(response.status).toBe(404);
  expect(response.body).toEqual({
    error: 'Experience Record Not Found',
    message: 'No experience record matches the supplied contentItemId',
  });
});
```

Add a pipeline test with an experience store whose `recordProcessing` rejects. Assert processing still returns normally and `onDiagnostic` receives `{ source: 'experience-store', operation: 'record-processing', error }`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --runInBand tests/unit/experience/ExperienceStore.test.ts tests/unit/api/routes.test.ts tests/unit/core/Pipeline.test.ts`

Expected: FAIL because the store currently returns `undefined` and the route always sends 200.

- [ ] **Step 3: Return update status and map false to 404**

Return `true` immediately after persistence of a matching feedback record and `false` after the search completes. In the route, await the boolean before sending success and return the stable 404 response when false. Replace the silent pipeline catch with a call to the optional diagnostic callback while keeping experience persistence non-fatal.

- [ ] **Step 4: Verify persistence and API suites**

Run: `npm.cmd test -- --runInBand tests/unit/experience/ExperienceStore.test.ts tests/unit/api/routes.test.ts tests/unit/core/Pipeline.test.ts`

Expected: PASS, including restart persistence for known feedback.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/experience/ExperienceStore.ts src/core/Pipeline.ts src/api/routes.ts tests/unit/experience/ExperienceStore.test.ts tests/unit/api/routes.test.ts tests/unit/core/Pipeline.test.ts
git commit -m "fix: reject feedback for missing experience records"
```

---

### Task 6: Enforce quality gates and reliable server shutdown

**Files:**
- Modify: `package.json`
- Modify: `src/api/server.ts`
- Modify: `src/api/index.ts`
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/processing.spec.ts`
- Create: `tests/unit/api/server.test.ts`
- Create: `tests/unit/strategies/StrategyRegistry.test.ts`

**Interfaces:**
- Produces `StartedServer { app: Express; server: Server; close(): Promise<void> }` from `startServer(port)`.
- Default `npm test` runs Jest with coverage; `npm run test:unit` remains the fast non-coverage command.

- [ ] **Step 1: Write failing server lifecycle and stronger E2E assertions**

Add a unit test that starts on port `0`, verifies `server.listening`, calls `close()`, and verifies it is no longer listening. Add a second test that calling `close()` twice resolves safely.

Strengthen the processing E2E test to assert:

```ts
expect(body.result.strategiesUsed.map((s: { strategyId: string }) => s.strategyId))
  .toEqual(expect.arrayContaining(['chunking', 'relevance-filter']));

const outputs = body.result.fusedOutput.data;
expect(outputs[0].metadata.confidence).toBe(body.result.confidence.overall);
expect(outputs[1].metadata.confidence).toBe(body.result.confidence.overall);
```

- [ ] **Step 2: Run lifecycle test and verify RED**

Run: `npm.cmd test -- --runInBand tests/unit/api/server.test.ts`

Expected: FAIL because `startServer` does not expose a closeable server handle.

- [ ] **Step 3: Implement closeable startup and signal shutdown**

Return:

```ts
export interface StartedServer {
  app: Express;
  server: Server;
  close(): Promise<void>;
}
```

`close()` resolves immediately when not listening and otherwise wraps `server.close`. In `index.ts`, retain the started handle and install one-shot `SIGINT` and `SIGTERM` handlers that await `close()` and then exit successfully. Startup failure still exits with code 1.

- [ ] **Step 4: Make test commands enforce the gate**

Set scripts to:

```json
{
  "test": "jest --coverage",
  "test:unit": "jest",
  "test:e2e": "playwright test"
}
```

In `playwright.config.ts`, run the server directly with `node -r ts-node/register src/api/index.ts` and set `gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }` so Windows does not leave an npm wrapper process between Playwright and the server.

- [ ] **Step 5: Cover the existing StrategyRegistry branch gap**

Create `tests/unit/strategies/StrategyRegistry.test.ts` with real strategies that cover duplicate registration, missing and successful unregister, type-list deletion after the final unregister, lookup, priority ordering, and clear:

```ts
test('rejects duplicate IDs and maintains type indexes', () => {
  const registry = new StrategyRegistry();
  const first = createStrategy('first', StrategyType.DENOISE, 20);
  const second = createStrategy('second', StrategyType.DENOISE, 10);

  registry.register(first);
  registry.register(second);

  expect(() => registry.register(first)).toThrow('already registered');
  expect(registry.listByPriority(StrategyType.DENOISE).map(s => s.id))
    .toEqual(['second', 'first']);
  expect(registry.unregister('missing')).toBe(false);
  expect(registry.unregister('first')).toBe(true);
  expect(registry.unregister('second')).toBe(true);
  expect(registry.getByType(StrategyType.DENOISE)).toEqual([]);
});

test('supports lookup and clear', () => {
  const registry = new StrategyRegistry();
  const strategy = createStrategy('semantic', StrategyType.SEMANTIC, 1);
  registry.register(strategy);
  expect(registry.get('semantic')).toBe(strategy);
  expect(registry.getAll()).toEqual([strategy]);
  registry.clear();
  expect(registry.getAll()).toEqual([]);
});
```

Run: `npm.cmd test -- --runInBand tests/unit/strategies/StrategyRegistry.test.ts`

Expected: PASS and `StrategyRegistry.ts` branch coverage reaches 100% or leaves only defensive branches that have explicit behavior tests elsewhere.

- [ ] **Step 6: Run coverage and close the gate**

Run: `npm.cmd test -- --runInBand`

Expected: all tests PASS and all four global metrics are at least 80%. The new pipeline, server, feedback, multilingual, and registry regression tests cover the previously missing branches; do not lower thresholds or add exclusions.

- [ ] **Step 7: Run E2E with a hard completion check**

Run: `npm.cmd run test:e2e`

Expected: three or more tests PASS, Playwright prints its summary, exits with code 0, and no process listens on port 3000 afterward.

- [ ] **Step 8: Run final verification**

Run in order:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --runInBand
npm.cmd run test:e2e
git diff --check
git status --short
```

Expected: lint/build/unit/E2E all PASS, coverage thresholds satisfied, no whitespace errors, and only intended files changed.

- [ ] **Step 9: Commit Task 6**

```powershell
git add package.json src/api/server.ts src/api/index.ts playwright.config.ts tests/e2e/processing.spec.ts tests/unit/api/server.test.ts tests/unit/strategies/StrategyRegistry.test.ts
git commit -m "test: enforce coverage and server lifecycle gates"
```

---

## Final Review Gate

After all six task commits:

1. Run the complete verification sequence from Task 6.
2. Request a whole-branch code review against commit `9af3f43`.
3. Fix every Critical or Important finding with covering tests.
4. Re-run the complete verification sequence.
5. Update `AGENTS.md`, module documentation, and `docs/project-overview.md` only where behavior described by this plan changed.
