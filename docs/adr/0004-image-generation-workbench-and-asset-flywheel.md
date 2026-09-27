# 0004: AI 生图工作台协议选型、参考图双模态与双向资产沉淀闭环

## 状态
已通过 (Accepted)

## 上下文与问题陈述
PromptSnap 旨在实现视觉灵感采集、反推、提示词库与 AI 生图的完整飞轮。在补齐第四大核心功能——AI 生图时，面临三个核心架构权衡：
1. **生图接口协议选型**：不同服务商（OpenAI、SiliconFlow、CheaperInference、Google Gemini 等）格式各异，如何保持代码纯粹且最大化兼容主流模型？
2. **参考图（垫图）的交互与执行语义**：从反推或词库一键带入图片时，如何在不同模型能力约束下提供最佳生图体验？
3. **生图产物的数据模型与归宿**：生图产物是应该直接混入灵感画廊，还是形成独立孤岛，抑或采用分层沉淀模式？

## 决策 (Decision)

### 1. 通用 OpenAI 兼容协议优先
- 采用业界最普及的 `POST /v1/images/generations` 规范作为首发核心协议，请求载荷支持：
  ```json
  {
    "model": "grok-imagine",
    "prompt": "...",
    "size": "1024x1024",
    "n": 1,
    "response_format": "b64_json"
  }
  ```
- 经实测验证，该协议无缝兼容用户提供的 `CheaperInference (grok-imagine)`、OpenAI (`dall-e-3`)、SiliconFlow (`black-forest-labs/FLUX.1-schnell`) 等主流端点。
- 响应解析层自动兼容 `b64_json`（解码为 Blob）与 `url` 直链（纯内存 Fetch 转 Blob），规避 Chrome 扩展 Service Worker 跨域与防盗链限制。

### 2. 参考图双模态设计 (Dual-Mode Reference)
- 提供工作台参考图插槽：
  - **默认模式（视觉对照）**：纯文生图，原图作为对照展示在侧边，便于直观比对还原效果；
  - **图生图模式（垫图）**：通过开关启用，调用 `/v1/images/edits` 或多模态 payload 进行垫图发散。

### 3. 三级顶级 Tab 与分层资产沉淀闭环
- **导航层**：侧边栏 Header 升级为三级 Segmented Control：`[🖼 灵感画廊]` · `[💡 提示词库]` · `[🎨 AI 生图]`。
- **数据层（分层闭环）**：
  - **工作台内部**：维持轻量生成任务历史（草稿箱），供用户对比调试；
  - **正式沉淀**：提供 `[📥 存入灵感画廊]`（打标 `['AI生图']`，生成 400px WebP 缩略图入库）与 `[⭐ 存入提示词库]`，打通灵感飞轮。

## 后果 (Consequences)
- **正面**：架构层次清晰，避免了调试废片污染用户灵感库；多源端点兼容性极佳；反推、词库与生图形成自洽的闭环飞轮。
- **合规与安全**：用户 API 凭据（BYOK）安全保存在本地 Chrome Storage 中，生图二进制完全由前端直连处理，无中心化中转。
