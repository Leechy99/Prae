# Prae — 智能去噪 + 语义提取平台

**版本:** 1.0.0
**日期:** 2026-04-22
**状态:** 设计完成，待评审

---

## 1. 产品概述

### 1.1 目标
构建一款具备自我进化能力的**智能去噪 + 语义提取**平台，支持多种输入源（HTML、文档、语音、企业知识库等），输出 LLM 友好的 JSON/Markdown 格式。

### 1.2 核心痛点解决
| 痛点 | 解决方案 |
|------|---------|
| 格式干扰 | 移除 HTML 标签、CSS 样式、广告、导航等 |
| 语义噪声 | 过滤无关内容、重复信息、低价值文本 |
| 结构缺失 | 转换为 LLM 友好的 JSON/Markdown/RAG Chunk 格式 |
| 上下文断裂 | 智能保持内容逻辑连贯性，支持 chunking 优化 |

### 1.3 目标用户
- AI Agent 开发者
- RAG 系统构建者
- 数据工程师 & 爬虫团队
- LLM 应用产品团队

### 1.4 交付形态
- **开源库 / SDK**: 开发者集成到 pipeline
- **SaaS API**: 云端 API，按调用量收费
- **开源 + 云服务混合**: 核心开源，增值能力云化

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        云端（经验中枢）                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 策略引擎 (Multi-Strategy)              │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │  │
│  │  │策略A   │ │策略B   │ │策略C   │ │策略N   │   │  │
│  │  │(HTML去噪)│ │(文档抽取)│ │(语音转文本)│ │(结构化)│  │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │  │
│  │       └──────────┬┴──────────┬┴──────────┘         │  │
│  │              策略选择器 (基于内容类型+置信度+历史)      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  经验库     │  │  策略版本库   │  │  全局置信度模型 │  │
│  │  (PostgreSQL│  │  (A/B测试支持) │  │  (联合学习)     │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    ↑ 策略下发 / 经验上报  ↓
                              │
┌─────────────────────────────────────────────────────────────┐
│                      客户侧（处理节点）                       │
│  ┌─────────────┐  ┌──────────────────────────────────────┐ │
│  │ 内容分类器   │→│           多策略处理管道                 │ │
│  │             │  │  ┌─────────────────────────────────┐  │ │
│  │             │  │  │策略路由层                        │  │ │
│  │             │  │  │  ↓    ↓    ↓    ↓              │  │ │
│  │             │  │  │[策略A] [策略B] [策略C] [策略D]   │  │ │
│  │             │  │  │  ↓    ↓    ↓    ↓              │  │ │
│  │             │  │  │  结果融合 + 置信度计算           │  │ │
│  │             │  │  └─────────────────────────────────┘  │ │
│  └─────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 策略类型

```
策略类型：
├── 去噪策略 (Denoise)
│   ├── HTMLCleanStrategy
│   ├── CSSStripStrategy
│   ├── AdBlockStrategy
│   └── NavigationFilterStrategy
├── 语义策略 (Semantic)
│   ├── EntityExtractionStrategy
│   ├── ChunkingStrategy
│   ├── ContextualizeStrategy
│   └── RelevanceFilterStrategy
└── 输出策略 (Output)
    ├── JSONSchemaStrategy
    ├── MarkdownStrategy
    └── RAGChunkStrategy
```

---

## 3. 核心接口设计

### 3.1 输入源接口 (InputSource)

```typescript
interface InputSource {
  name: string;
  version: string;
  supportedTypes: string[];

  parse(raw: Uint8Array): ContentItem;
  detect(partial: Uint8Array): ContentHint;
  validate(item: ContentItem): boolean;
}

interface ContentItem {
  id: string;
  source: string;
  raw: Uint8Array;
  meta: Record<string, any>;
  hints: ContentHint;
}

interface ContentHint {
  mimeType?: string;
  encoding?: string;
  estimatedSize?: number;
  possibleTypes?: string[];
  confidence?: number;
}
```

### 3.2 输出格式接口 (OutputFormatter)

```typescript
interface OutputFormatter {
  name: string;
  contentType: string;
  outputMode: "structured" | "text" | "stream";

  format(result: ProcessingResult, config: FormatConfig): OutputItem;
  validate(output: OutputItem): boolean;
  configSchema(): JSONSchema;
}

interface FormatConfig {
  includeMetadata?: boolean;
  includeDiagnostics?: boolean;
  chunkSize?: number;
  outputFields?: string[];
  customMapping?: Record<string, string>;
}
```

### 3.3 置信度接口

```typescript
interface ConfidenceConfig {
  thresholds: {
    pass: number;      // ≥ 此值直接通过，默认 0.85
    retry: number;    // ≥ 此值触发重试，默认 0.60
    escalate: number; // < 此值上报云端，默认 0.40
  };
  components: {
    textQuality: WeightConfig;
    entityExtraction: WeightConfig;
    structuralIntegrity: WeightConfig;
    contextualCoherence: WeightConfig;
  };
  historicalWeight: number;
  consistencyBonus: number;
}

interface ConfidenceScore {
  overall: number;
  components: {
    textQuality: number;
    entityExtraction: number;
    structuralIntegrity: number;
    contextualCoherence: number;
  };
  bonus: {
    historicalConsistency: number;
    multiStrategyAgreement: number;
  };
  isPassing: boolean;
}
```

---

## 4. 完整处理状态机

```
START → CLASSIFY_CONTENT → ROUTE_STRATEGIES → EXECUTE_STRATEGIES
                                                    ↓
                                            FUSE_RESULTS
                                                    ↓
                                       EVALUATE_CONFIDENCE
                                         ↓         ↓
                                      (pass)     (fail)
                                         ↓         ↓
                                   FORMAT_OUTPUT  RETRY_LOOP
                                                    ↓
                                        retryCount < maxRetries
                                                    ↓
                                          RETRY with fallback
                                                    ↓
                                        retryCount ≥ maxRetries
                                                    ↓
                                            ESCALATE_CLOUD
                                                    ↓
                                           成功 ←  失败
                                                  ↓
                                         HUMAN_INTERVENTION
                                                    ↓
                                                END
```

---

## 5. API 设计

### 5.1 核心端点

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | /api/v1/process | 处理单个内容 |
| POST | /api/v1/process/batch | 批量处理 |
| GET | /api/v1/process/{id}/status | 查询处理状态 |
| GET | /api/v1/process/{id}/result | 获取处理结果 |
| GET | /api/v1/strategies | 列出可用策略 |
| POST | /api/v1/strategies | 注册新策略 |
| GET | /api/v1/experience | 查询经验记录 |
| POST | /api/v1/experience/feedback | 提交人工反馈 |

### 5.2 认证方式
- API Key: `X-API-Key: {key}`
- OAuth 2.0 Bearer Token
- mTLS (高安全场景)

---

## 6. 多租户隔离

### 6.1 三层隔离策略

| 模式 | 适用客户 | 部署 | 成本 |
|------|---------|------|------|
| 物理隔离 | 超大型企业、政府、金融 | 独立数据库、独立计算资源 | 高 |
| 逻辑隔离 | 中大型企业 | 共享计算资源，独立 schema | 中 |
| 共享模式 | 小型客户、开发者 | 完全共享资源 | 低 |

### 6.2 技术实现
- PostgreSQL: Row-Level Security
- Redis: Tenant Key Prefix
- 消息队列: Tenant Routing

---

## 7. 自我修复机制

### 7.1 三层错误处理

1. **本地重试层**: 瞬时错误重试 1-3 次
2. **云端补救层**: Claude 策略引擎分析 + 生成新策略
3. **人工介入层**: 记录完整上下文，进入审核队列

### 7.2 经验记录

```typescript
interface ExperienceRecord {
  id: string;
  tenantId: string;

  input: {
    sourceType: string;
    contentType: string;
    rawHash: string;
    size: number;
  };

  processing: {
    strategiesUsed: StrategyExecution[];
    fusionMethod: string;
    finalConfidence: number;
    processingTimeMs: number;
    retryCount: number;
  };

  outcome: "SUCCESS" | "RETRY_SUCCESS" | "CLOUD_ESCALATED" | "HUMAN_INTERVENTION" | "FAILED";

  humanFeedback?: {
    correctedResult?: ProcessingResult;
    feedback: string;
  };

  learning: {
    isLearned: boolean;
    strategyUpdates?: StrategyUpdate[];
  };
}
```

---

## 8. 策略版本管理 & A/B Testing

### 8.1 策略版本

```yaml
StrategyVersion:
  id: "html-clean-v2.3.1"
  status: "STABLE" | "BETA" | "DEPRECATED"
  rollout:
    type: "canary" | "percentage" | "tenant-filter"
    canaryPercentage: 10
```

### 8.2 A/B 测试

```yaml
ABTest:
  variants:
    - id: "control"
      strategyId: "entity-extract-v2"
      weight: 50
    - id: "treatment"
      strategyId: "entity-extract-v3"
      weight: 50
  metrics:
    primary: "successRate"
    secondary: ["avgConfidence", "avgProcessingTime"]
  decision: "PROMOTE_TREATMENT" if p < 0.05
```

---

## 9. 安全架构

### 9.1 认证 & 授权
- API Key / OAuth 2.0 / mTLS
- RBAC: viewer, processor, strategist, experiencer, admin
- 多租户数据隔离

### 9.2 数据安全
- TLS 1.3 传输加密
- AES-256-GCM 存储加密
- 敏感数据自动脱敏

---

## 10. 成本模型

### 10.1 月度成本估算（百万级/日处理量）

| 项目 | 估算 |
|------|------|
| Claude API | $225 |
| Kubernetes | $144-$288 |
| PostgreSQL | $50 |
| Redis | $80 |
| S3/流量 | $20 |
| **总计** | **~$550-600** |

### 10.2 成本优化策略
- 本地优先: 90%+ 本地处理
- 智能缓存: 20-30% 重复处理减少
- 批量聚合: API 调用次数减少 50%
- 模型分级: 不同场景用不同强度模型

---

## 11. 可观测性

### 11.1 核心指标
- `processing_total`: 处理量
- `processing_duration_seconds`: 处理耗时
- `confidence_score`: 置信度分布
- `retry_total`: 重试次数
- `escalation_total`: 上报次数

### 11.2 链路追踪
- OpenTelemetry 格式
- Trace ID 贯穿整个处理流程

---

## 12. 测试策略

### 12.1 测试分层
- 单元测试: ≥ 80% 覆盖率
- 集成测试: 组件间交互
- E2E 测试: 关键用户流程

### 12.2 测试环境
- Local: Docker Compose
- Staging: K8s 沙箱环境

---

## 13. 扩展机制

### 13.1 输入源扩展
实现 `InputSource` 接口，注册到 registry。

### 13.2 策略扩展
通过 YAML 配置定义新策略，支持 local/cloud/hybrid 实现。

### 13.3 输出格式扩展
实现 `OutputFormatter` 接口，注册自定义格式。

---

## 14. 下一步

1. 评审设计文档
2. 确定 MVP 范围
3. 制定实施计划
