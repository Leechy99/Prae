# Prae Project Overview / Prae 项目速览

**Updated / 更新时间:** 2026-06-03

## Recent Optimizations / 最近优化记录

### 2026-06-03

- EN: `LocalExperienceStore` now supports optional JSON file persistence while preserving the existing in-memory mode for tests and injected stores.
  中文：`LocalExperienceStore` 现在支持可选 JSON 文件持久化，同时保留测试和注入场景使用的内存模式。
- EN: The default API feedback flow persists local experience records to `data/experience-store.json`; deployments can override this path with `PRAE_EXPERIENCE_STORE_PATH`.
  中文：默认 API 反馈流程会把本地经验记录持久化到 `data/experience-store.json`；部署时可通过 `PRAE_EXPERIENCE_STORE_PATH` 覆盖路径。
- EN: Restart persistence is covered by unit tests for both `LocalExperienceStore` and `/api/v1/experience/feedback`.
  中文：`LocalExperienceStore` 与 `/api/v1/experience/feedback` 都已补充重启持久化单元测试。

### 2026-06-01

- EN: `/api/v1/process` now parses HTML through `InputRegistry` and `HTMLInputSource` instead of manually constructing a basic `ContentItem`.
  中文：`/api/v1/process` 现在通过 `InputRegistry` 和 `HTMLInputSource` 解析 HTML 内容，不再手动拼装基础 `ContentItem`。
- EN: Pipeline now writes fused results back into the intermediate content state after each stage, so semantic fields such as `filteredText`, `chunks`, and `totalChunks` can flow into output strategies.
  中文：Pipeline 现在会把每个阶段的融合结果写回中间态，语义阶段产生的 `filteredText`、`chunks`、`totalChunks` 等字段可以继续进入输出阶段。
- EN: Strategy result fusion now merges key processing fields rather than selecting a single text result, preserving cleanup stats, chunks, and semantic output.
  中文：策略结果融合逻辑从“优先挑一个文本结果”升级为“合并关键处理字段”，避免丢失清洗统计、分块和语义结果。
- EN: JSON and Markdown output prefer semantic `filteredText`; JSON output includes `chunks` when available.
  中文：JSON/Markdown 输出优先使用语义过滤后的 `filteredText`；JSON 输出在可用时会携带 `chunks`。
- EN: `/api/v1/process` now returns `contentItemId`, making it possible for clients to submit feedback for the same processed content item.
  中文：`/api/v1/process` 响应新增 `contentItemId`，方便客户端对同一次内容处理提交反馈。
- EN: `/api/v1/experience/feedback` now calls `ExperienceStore.addHumanFeedback` and can write feedback by `contentItemId`.
  中文：`/api/v1/experience/feedback` 已接入 `ExperienceStore.addHumanFeedback`，可按 `contentItemId` 写回本地经验记录。
- EN: `LocalExperienceStore` stores `contentItemId` and can provide historical confidence context back to the Pipeline.
  中文：`LocalExperienceStore` 现在记录 `contentItemId`，并可为 Pipeline 提供历史置信度上下文。

## Positioning / 项目定位

EN: Prae is a data preprocessing platform for AI Agents, RAG systems, and LLM applications. Its core goal is to remove noise from raw HTML or web content, then extract and reshape the result into LLM-friendly JSON, Markdown, or chunked text.

中文：Prae 是一个面向 AI Agent、RAG 系统和 LLM 应用的数据预处理平台。它的核心目标是把原始 HTML 或网页内容中的噪声去掉，再提取、整理成适合大模型消费的 JSON、Markdown 或分块文本。

EN: In short, Prae solves the problem that web pages are noisy, expensive, and unreliable when sent directly to LLMs.

中文：简单说，Prae 解决的是“网页内容很脏，直接喂给 LLM 成本高、效果差”的问题。

## What It Does / 主要做什么

EN: Prae is currently implemented as a TypeScript + Node.js content-processing service. It exposes an Express API and sends input content through a pluggable strategy pipeline.

中文：Prae 当前实现的是一个 TypeScript + Node.js 的内容处理服务，提供 Express API，把输入内容经过一条可插拔策略流水线处理。

1. **Input Detection and Parsing / 输入识别与解析**
   - EN: HTML is the primary supported input format today.
     中文：当前主要支持 HTML 输入。
   - EN: The API uses `InputRegistry` to select an appropriate input source.
     中文：API 通过 `InputRegistry` 选择合适输入源。
   - EN: `HTMLInputSource` uses `jsdom` to parse HTML and extract title, body text, MIME metadata, and related hints.
     中文：`HTMLInputSource` 使用 `jsdom` 解析 HTML，提取标题、正文文本、MIME 类型等基础信息。

2. **Noise Removal / 内容降噪**
   - EN: Removes non-content tags such as `script`, `style`, `noscript`, and `iframe`.
     中文：移除 `script`、`style`、`noscript`、`iframe` 等非正文标签。
   - EN: Removes page-structure noise such as `nav`, `header`, `footer`, and `aside`.
     中文：移除 `nav`、`header`、`footer`、`aside` 等导航/页面结构噪声。
   - EN: Filters common ad, popup, subscription, banner, and promo elements using class, id, and role patterns.
     中文：根据 class、id、role 过滤广告、弹窗、订阅、横幅等常见页面噪声。

3. **Semantic Processing / 语义处理**
   - EN: Splits cleaned text into sentence-based chunks with a target size of about 512 characters and a small overlap.
     中文：对清洗后的文本进行句子级分块，目标块大小约 512 字符，并保留一定 overlap。
   - EN: Removes paragraphs that are too short to be useful.
     中文：过滤过短段落。
   - EN: Uses Jaccard similarity to remove duplicate paragraphs.
     中文：使用 Jaccard 相似度去除重复段落。
   - EN: Semantic-stage results are written back to `ContentItem` for downstream output strategies.
     中文：语义阶段结果会写回 `ContentItem`，供后续输出策略使用。

4. **Output Generation / 输出生成**
   - EN: Produces structured JSON with text, title, source, processing time, confidence, and strategy metadata.
     中文：生成结构化 JSON 输出，包含正文、标题、来源、处理时间、置信度、策略信息等。
   - EN: JSON output prefers `filteredText` and includes `chunks` when chunking results are available.
     中文：JSON 输出会优先使用 `filteredText`，并在存在分块结果时包含 `chunks`。
   - EN: Produces Markdown while preserving title and paragraph structure.
     中文：生成 Markdown 输出，保留标题和段落结构。
   - EN: Markdown output also prefers semantically filtered text.
     中文：Markdown 输出同样优先使用语义过滤后的文本。

5. **Confidence Scoring / 置信度评分**
   - EN: Calculates an overall confidence score from text quality, entity extraction, structural integrity, and contextual coherence.
     中文：从文本质量、实体提取、结构完整性、上下文连贯性等维度计算综合置信度。
   - EN: Uses thresholds to decide whether processing succeeded, should retry, needs human intervention, or should escalate to cloud handling.
     中文：根据阈值决定处理结果是成功、重试、人工介入，或云端升级处理。

6. **Experience Storage / 经验存储**
   - EN: Provides `LocalExperienceStore` with in-memory operation by default and optional JSON file persistence.
     中文：提供 `LocalExperienceStore`，默认可作为内存存储使用，也支持可选 JSON 文件持久化。
   - EN: Records processing results, human feedback, and learnable records.
     中文：可记录处理结果、人类反馈和可学习记录。
   - EN: Processing results store `contentItemId`, and feedback can be written back by that ID.
     中文：处理结果会保存 `contentItemId`，反馈接口可按该 ID 写回记录。
   - EN: The default API store persists to `data/experience-store.json`; set `PRAE_EXPERIENCE_STORE_PATH` to choose another file.
     中文：默认 API 存储会持久化到 `data/experience-store.json`；可设置 `PRAE_EXPERIENCE_STORE_PATH` 指定其他文件。

## Architecture / 核心架构

EN: Prae uses pluggable input sources and a staged strategy pipeline.

中文：项目采用插件化输入源和策略流水线设计。

```text
Raw Content
  -> InputSource
  -> ContentItem
  -> DENOISE strategies
  -> SEMANTIC strategies
  -> OUTPUT strategies
  -> ConfidenceScorer
  -> ProcessingResult
```

| Module / 模块 | Path / 路径 | Responsibility / 作用 |
| --- | --- | --- |
| API | `src/api/` | EN: Express service, routes, auth, validation. 中文：Express 服务、路由、鉴权、请求校验。 |
| Core | `src/core/` | EN: Pipeline orchestration and confidence scoring. 中文：Pipeline 编排、置信度评分。 |
| Input | `src/input/` | EN: Input source interface, HTML parsing, MIME detection. 中文：输入源接口、HTML 解析、MIME 检测。 |
| Strategies | `src/strategies/` | EN: Noise removal, semantic processing, and output strategies. 中文：降噪、语义、输出策略。 |
| Experience | `src/experience/` | EN: Local experience records and feedback. 中文：本地经验记录与反馈。 |
| Types | `src/types/` | EN: Shared TypeScript interfaces. 中文：共享 TypeScript 类型。 |

## Public API / 对外 API

- `GET /health`
  - EN: Health check. Authentication is not required.
    中文：健康检查，无需认证。

- `POST /api/v1/process`
  - EN: Accepts base64-encoded content.
    中文：接收 base64 编码内容。
  - EN: Parses content through the input source registry; HTML is supported by default.
    中文：使用输入源注册表解析内容，当前默认支持 HTML。
  - EN: Runs content through cleaning, semantic processing, and output generation.
    中文：通过 Pipeline 执行内容清洗、语义处理和输出生成。
  - EN: Returns processing result ID, `contentItemId`, confidence, timing, fused output, and strategy execution details.
    中文：返回处理结果 ID、`contentItemId`、置信度、耗时、融合输出和策略执行信息。

- `GET /api/v1/strategies`
  - EN: Lists currently registered strategies.
    中文：返回当前注册策略列表。

- `POST /api/v1/experience/feedback`
  - EN: Accepts feedback for a processed content item.
    中文：接收内容处理反馈。
  - EN: Calls the local `ExperienceStore` to record feedback.
    中文：调用本地 `ExperienceStore` 记录反馈。
  - EN: Supports writing feedback by the `contentItemId` returned from `/process`.
    中文：支持按 `/process` 返回的 `contentItemId` 写回对应处理记录。

## Tech Stack / 当前技术栈

- TypeScript 5.3
- Node.js + Express
- CommonJS module output / CommonJS 模块输出
- `jsdom` for HTML parsing / 使用 `jsdom` 解析 HTML
- `zod` for request validation / 使用 `zod` 做请求校验
- Jest for unit tests / Jest 单元测试
- Playwright for E2E tests / Playwright E2E 测试

## Current Status / 当前状态

EN: Prae has a working MVP foundation:

中文：从源码看，Prae 已经具备 MVP 骨架：

- EN: Core Pipeline orchestration is implemented.
  中文：已有核心 Pipeline 编排。
- EN: Input registration and HTML input parsing are implemented.
  中文：已有输入源注册和 HTML 输入源。
- EN: There are 2 denoise strategies, 2 semantic strategies, and 2 output strategies.
  中文：已有 2 个降噪策略、2 个语义策略、2 个输出策略。
- EN: Pipeline stages now pass key intermediate results forward, so output strategies can use semantic filtering and chunking results.
  中文：Pipeline 阶段之间已经传递关键中间结果，输出阶段可以使用语义过滤和分块结果。
- EN: Confidence scoring and retry/escalation outcome decisions are implemented.
  中文：已有置信度评分和重试/升级结果判断。
- EN: Express API routes and test configuration are available.
  中文：已有 Express API 层和测试配置。
- EN: The feedback API is connected to the local experience store.
  中文：反馈 API 已与本地经验存储打通。
- EN: Local experience feedback survives service restarts when the default API file-backed store is used.
  中文：使用默认 API 文件存储时，本地经验反馈可在服务重启后保留。
- EN: Jest unit tests and Playwright E2E configuration are present.
  中文：已有 Jest 单元测试与 Playwright E2E 测试配置。

## Remaining Gaps / 待补齐点

- EN: HTML is currently the main supported input. Documents, audio, and enterprise knowledge sources remain design-stage capabilities.
  中文：目前主要处理 HTML，其他文档、音频、企业知识库等输入仍处于设计愿景。
- EN: Experience storage now supports local file persistence, but richer retrieval APIs and strategy-update learning are not implemented yet.
  中文：经验存储已支持本地文件持久化，但更完整的检索 API 和策略更新学习机制尚未实现。
- EN: API key handling is still development-oriented and needs stronger environment-based production configuration.
  中文：API key 仍是开发期配置形态，缺少完整环境变量配置。
- EN: CI/CD is not yet configured.
  中文：CI/CD 工作流尚未建立。

## One-Sentence Summary / 一句话总结

EN: Prae cleans, deduplicates, chunks, and converts noisy HTML or web content into LLM-friendly JSON and Markdown, providing cleaner structured input for RAG, Agent, and LLM applications.

中文：Prae 是一个把嘈杂网页/HTML 内容清洗、去重、分块并转成 LLM 友好 JSON/Markdown 的智能内容预处理平台，核心价值在于为 RAG、Agent 和大模型应用提供更干净、更结构化的输入。
