# Module: src/experience — Experience Store & Learning

## Module Overview

Local in-memory store for recording processing outcomes and learning. `LocalExperienceStore` implements a `Map`-based store keyed by `tenantId:sourceType`. Records `ProcessingResult` with input fingerprints, strategy sequences, outcomes, and optional human feedback.

**Note:** Two `ExperienceStore` interfaces exist — one in `src/experience/ExperienceStore.ts` (full interface) and one stub in `src/core/Pipeline.ts` (only 2 methods). These are incompatible and need unification.

## Public API

### ExperienceStore Interface

```typescript
// src/experience/ExperienceStore.ts
export interface ExperienceStore {
  record(result: ProcessingResult, tenantId?: string): Promise<void>;
  getLatest(sourceType: string, tenantId?: string): Promise<ExperienceRecord | null>;
  getByOutcome(outcome: ProcessingResult['outcome'], tenantId?: string): Promise<ExperienceRecord[]>;
  addHumanFeedback(recordId: string, feedback: string, correctedResult?: unknown, tenantId?: string): Promise<void>;
  getLearnableRecords(tenantId?: string): Promise<ExperienceRecord[]>;
}
```

### LocalExperienceStore Implementation

```typescript
// src/experience/ExperienceStore.ts
export class LocalExperienceStore implements ExperienceStore {
  constructor()
  async record(result: ProcessingResult, tenantId?: string): Promise<void>
  async getLatest(sourceType: string, tenantId?: string): Promise<ExperienceRecord | null>
  async getByOutcome(outcome: ProcessingResult['outcome'], tenantId?: string): Promise<ExperienceRecord[]>
  async addHumanFeedback(recordId: string, feedback: string, correctedResult?: unknown, tenantId?: string): Promise<void>
  async getLearnableRecords(tenantId?: string): Promise<ExperienceRecord[]>
}
```

## Key Types

```typescript
// src/experience/ExperienceRecord.ts
export interface ExperienceRecord {
  id: string;                    // "${tenantId}:${sourceType}:${randomHex}"
  tenantId: string;
  input: ExperienceRecordInput;
  processing: ExperienceRecordProcessing;
  outcome: ProcessingResult['outcome'];
  humanFeedback?: HumanFeedback;
  learning: Learning;
  createdAt: number;
  updatedAt: number;
}

export interface ExperienceRecordInput {
  sourceType: string;
  contentType: string;
  rawHash: string;      // SHA-256, first 16 hex chars
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
```

## Dependencies

| Dependency | Purpose | Source |
|-----------|---------|--------|
| `crypto` (Node.js built-in) | SHA-256 hashing via `createHash` | — |
| `../types` | `ProcessingResult`, `ContentItem` | `src/types/index.ts` |
| `./ExperienceRecord` | `ExperienceRecord` type | `src/experience/ExperienceRecord.ts` |

## File Structure

```
src/experience/
├── ExperienceRecord.ts  # Type definitions for ExperienceRecord
└── ExperienceStore.ts   # ExperienceStore interface + LocalExperienceStore implementation
```

## Mermaid Diagram — Data Flow

```mermaid
graph LR
    A["ProcessingResult\n(from Pipeline)"] --> B["ExperienceStore.record()"]
    B --> C["ExperienceRecord\nstored in Map"]
    C --> D["getLatest()\ngetByOutcome()"]
    C --> E["addHumanFeedback()"]
    C --> F["getLearnableRecords()\n(humanFeedback != null && !isLearned)"]
```

## Important Implementation Details

### Storage

`LocalExperienceStore` uses an in-memory `Map<string, ExperienceRecord[]>` keyed by `${tenantId}:${sourceType}`. **Not persistent** — data is lost on process restart.

### Content Fingerprinting

```typescript
function hashContent(content: Uint8Array): string {
  return createHash('sha256').update(content).digest().slice(0, 16).toString('hex');
}
```

### Record ID Format

`${tenantId}:${sourceType}:${randomBytes(8).toString('hex')}` — uniqueness not guaranteed across rapid inserts.

### getLatest() Implementation

Returns the most recently added record for a given `sourceType` (last element in the array):

```typescript
async getLatest(sourceType: string, tenantId: string = 'default'): Promise<ExperienceRecord | null> {
  const key = `${tenantId}:${sourceType}`;
  const records = this.records.get(key);
  if (!records || records.length === 0) return null;
  return records[records.length - 1];  // Most recent
}
```

### getLearnableRecords Logic

Returns records where `humanFeedback !== undefined && learning.isLearned === false`. These are records awaiting integration into strategy updates.

### addHumanFeedback() Behavior

Updates the record in-place, setting `humanFeedback` and `updatedAt`:

```typescript
record.humanFeedback = { correctedResult, feedback };
record.updatedAt = Date.now();
```

### Interface Split (Known Issue)

`src/core/Pipeline.ts` defines its own stub interface (lines 10-13):
```typescript
export interface ExperienceStore {
  getHistoricalContext(contentItemId: string): Promise<unknown>;
  recordProcessing(contentItemId: string, result: ProcessingResult): Promise<void>;
}
```

This is **incompatible** with `src/experience/ExperienceStore.ts`'s full interface. Pipeline uses the stub, so `LocalExperienceStore` cannot be directly attached without adapter changes.

## Testing

| Test File | Coverage |
|-----------|----------|
| `tests/unit/experience/ExperienceStore.test.ts` | Full LocalExperienceStore API |

## Related Files

| Path | Purpose |
|------|---------|
| `../core/Pipeline.ts` | Uses ExperienceStore stub interface |
| `../types/index.ts` | `ProcessingResult` type |
| `../../CLAUDE.md` | Root documentation |

## Changelog

- **2026-04-23 16:11:05** — Updated module documentation with complete API signatures, storage details, and interface incompatibility warning
- **2026-04-23** — Updated to new format with Mermaid diagram, complete API signatures, dependency table