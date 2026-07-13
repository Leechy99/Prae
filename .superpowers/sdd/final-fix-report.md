# Final Review Fix Report

Date: 2026-07-14
Worktree: `D:\project\Prae\.worktrees\pipeline-correctness`

## Status

Final-review behavior fixes, regression coverage, readonly type strengthening, and documentation alignment are complete. All focused, static, build, coverage, and elevated E2E gates pass.

## Implemented Fixes

1. Added shared `getCanonicalText()` for both output renderers using `filteredText ?? cleanedText ?? textContent ?? ''`.
   - `filteredText: ''` is authoritative.
   - Both renderer `canApply()` methods return `false` for empty canonical text.
   - Direct renderer execution emits empty JSON text / Markdown instead of stale fallback text.
2. Changed feedback lookup to preserve exact generated-record-ID targeting, then compare `contentItemId` matches newest-first across all tenant-scoped source arrays.
   - Feedback after retries attaches to the newest terminal attempt, including cross-source records; retry count breaks equal-timestamp ties.
   - Unknown targets still return `false`; API 404 behavior remains covered.
3. Contained exceptions thrown by `onDiagnostic`, keeping diagnostics observational.
4. Replaced the stale retry assertion with an always-authorizing `RetryPolicy` boundary regression.
   - `maxRetries: 2` produces exactly two added attempts and `retryCount === 2`.
5. Strengthened `PipelineState` readonly typing for chunk elements and nested confidence components/bonuses without attempting generic deep cloning of arbitrary metadata.
6. Aligned root, project, Core, API, Experience, and relevant Strategy documentation with the implemented contracts.
7. Applied independent-review follow-ups so nullishly selected non-string metadata is normalized consistently and newest feedback selection spans every source bucket.

## TDD Evidence

### RED

Command:

```text
npm.cmd test -- --runInBand tests/unit/strategies/output.test.ts tests/unit/experience/ExperienceStore.test.ts tests/unit/core/Pipeline.test.ts
```

Observed before production edits:

- JSON empty-canonical regression failed: `canApply()` returned `true` instead of `false`.
- Markdown empty-canonical regression failed: `canApply()` returned `true` instead of `false`.
- Retry feedback regression failed: feedback was absent from the newest `RETRY_SUCCESS` record because it was written to the oldest attempt.
- Throwing diagnostic callback regression failed: processing returned `FAILED`.
- Summary: 4 failed, 66 passed. The focused invocation also reported expected global coverage-gate failures because it intentionally ran only three suites.

The direct always-authorized `maxRetries` regression passed against the existing retry loop. This finding was a stale/vacuous-test defect rather than a production boundary defect, so no retry-loop behavior change was necessary or made.

### Review follow-up RED/GREEN

Independent review identified two additional edge cases. New regressions first produced:

- Cross-source feedback failed because the first source bucket received feedback.
- JSON and Markdown non-string canonical values failed because `canApply()` and direct rendering diverged.
- RED summary: 3 failed, 39 passed.

After the focused fixes, the same two suites passed 42/42 tests. The reviewer then confirmed both findings resolved with no remaining scoped findings.

### GREEN

After minimal production changes:

```text
npm.cmd test -- --runInBand --coverage=false tests/unit/strategies/output.test.ts tests/unit/experience/ExperienceStore.test.ts tests/unit/core/Pipeline.test.ts
```

Result: 3 suites passed, 70 tests passed.

Final focused command including the API feedback route:

```text
npm.cmd test -- --runInBand --coverage=false tests/unit/strategies/output.test.ts tests/unit/experience/ExperienceStore.test.ts tests/unit/api/routes.test.ts tests/unit/core/Pipeline.test.ts
```

Result: 4 suites passed, 88 tests passed.

## Full Verification

### Static and build

- `npm.cmd run lint` — PASS (`tsc --noEmit`)
- `npm.cmd run build` — PASS (`tsc`)

### Default coverage gate

Command: `npm.cmd test -- --runInBand`

- 12 suites passed
- 194 tests passed
- Statements: 93.22%
- Branches: 81.18%
- Functions: 95.37%
- Lines: 92.97%
- Required global threshold: 80% in every dimension — PASS

### Elevated E2E

Command: `npm.cmd run test:e2e` (elevated outside the managed Windows sandbox)

- 3 Playwright tests passed
- Processing, missing-auth rejection, and strategy listing all passed
- Runtime: 2.1s reported by Playwright

Elevation was required because Playwright's managed web-server shutdown path invokes Windows `taskkill`, which the sandbox denies. This is an environment permission constraint, not an application failure.

### Repository hygiene

- `git diff --check` — PASS (no whitespace errors)
- `git status --short` — only final-review code, tests, documentation, shared helper, and this report are present before commit
- Git emitted Windows LF-to-CRLF conversion notices; these are line-ending notices, not `diff --check` failures.

## Documentation Conflict Resolution

The 2026-04-22 MVP plan is historical and conflicts with the approved current design/code in several places. Resolution followed the final-fix brief's rule that current code plus approved design govern:

- Historical plan: OUTPUT before confidence. Current approved behavior: DENOISE -> SEMANTIC -> confidence -> OUTPUT.
- Historical plan: threshold/maxRetries-driven automatic retries. Current approved behavior: retries are opt-in through `RetryPolicy`; `maxRetries` only caps added attempts.
- Historical plan/API docs: old Express/server return assumptions. Current contract: `Promise<StartedServer>` with idempotent async `close()`.
- Historical experience signature: feedback returned no match signal. Current contract: `Promise<boolean>`, with API 404 for `false`.

No documentation claims CI exists.

## Review and Concerns

Independent code review initially found two P2 edge cases (cross-source newest matching and non-string canonical normalization). Both received RED regressions and fixes. Narrow re-review confirmed both resolved and reported no remaining findings.

Known residual concerns: none within the final-fix brief. Arbitrary custom metadata is intentionally not generically deep-cloned; only known pipeline state is strengthened as requested.

## Commit

Subject: `fix: close pipeline correctness review findings`

This report is included in the single final-review commit; the resulting SHA is returned with the handoff.

---

## Follow-up: Canonical Boundary Consistency (2026-07-14)

### Finding

The output helper normalized non-string metadata, but initial PipelineState only accepted strings and ConfidenceScorer used `as string` assertions. Consequently, `filteredText: 42` could throw during scoring and synthesize a pipeline failure, while `filteredText: 0` was treated as absent by core code but as canonical by renderers.

### RED

Added regressions for `42` and `0` in:

- `tests/unit/core/Pipeline.test.ts` using the real Pipeline plus JSON and Markdown renderers
- `tests/unit/core/PipelineState.test.ts`
- `tests/unit/core/ConfidenceScorer.test.ts`

Command:

```text
npm.cmd test -- --runInBand --coverage=false tests/unit/core/Pipeline.test.ts tests/unit/core/PipelineState.test.ts tests/unit/core/ConfidenceScorer.test.ts
```

Observed: 6 failed, 58 passed. `42` threw `text.trim is not a function`; `0` scored as empty; PipelineState dropped both numeric values; Pipeline projected unsanitized numeric metadata.

### GREEN implementation

- Added neutral `src/utils/CanonicalText.ts` with nullish selection and safe string normalization.
- PipelineState normalizes canonical fields during initial state creation and transform merging.
- ConfidenceScorer consumes the neutral contract and no longer asserts unknown metadata as string.
- The output adapter delegates to the same contract.
- Nullish precedence and authoritative empty-string behavior remain unchanged.
- No generic arbitrary-metadata deep cloning was added.

Focused command:

```text
npm.cmd test -- --runInBand --coverage=false tests/unit/core/Pipeline.test.ts tests/unit/core/PipelineState.test.ts tests/unit/core/ConfidenceScorer.test.ts tests/unit/strategies/output.test.ts
```

Result: 4 suites passed, 89 tests passed.

### Documentation correction

The Core flow diagram now makes retry authorization explicit: a retry occurs only when an injected `RetryPolicy` authorizes `nextAttempt` and `nextAttempt <= maxRetries`; otherwise the terminal result is returned.

### Follow-up verification

- Focused Pipeline/State/Scorer/Output: 4 suites, 89 tests passed.
- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS.
- Full default coverage: 12 suites, 200 tests passed.
  - Statements: 93.42%
  - Branches: 81.27%
  - Functions: 95.42%
  - Lines: 93.18%
- Elevated `npm.cmd run test:e2e`: 3/3 passed in 2.1s.
- `git diff --check`: PASS.
- Pre-commit status contains only the scoped canonical utility/state/scorer/adapter, regressions, Core/Strategy docs, and this appended report.

Independent follow-up review: no findings. The reviewer confirmed consistent `42`/`0` normalization, preserved nullish and authoritative-empty semantics, no dependency cycle, accurate policy-gated retry documentation, integrated regression coverage, and narrow scope.
