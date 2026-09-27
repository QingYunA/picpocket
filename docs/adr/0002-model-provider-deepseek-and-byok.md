# 0002: 首发模型选型：DeepSeek v4.1 Flash 与 OpenAI 兼容多模态协议

## 状态
已通过 (Accepted)

## 上下文与问题陈述
在为 Chrome 扩展实现“外接模型反推视觉 Prompt”能力时，需要确定首发默认支持的模型及其调用协议。
用户需要模型具备以下关键特性：
1. **强大的视觉与细节理解能力**：能够精准识别画风流派、媒介类型（如 3D 黏土、水彩手绘、赛博霓虹等）、光影氛围与镜头视角。
2. **极致的响应速度与经济性**：作为频繁交互的桌面插件，模型反推耗时需控制在秒级，且 Token 成本极低，降低用户自带 Key 的心智负担。
3. **协议通用性**：支持标准的多模态请求协议，便于用户切换官方 API、本地 Ollama 或各聚合服务商。

## 决策 (Decision)
1. **首发默认支持 DeepSeek v4.1 Flash**：
   - 经在 Models.dev 检索验证，DeepSeek v4.1 Flash 具备完整的视觉多模态输入（text/image multimodal input）、高阶推理（reasoning）以及出色的代码/指令遵循能力，且在各大提供商处单价极低（输入仅约 $0.22~$0.23 / 1M tokens）。
2. **底层采用标准 OpenAI Chat Completions 多模态协议**：
   - 请求格式采用标准 `messages` 数组形式：
     ```json
     {
       "model": "deepseek-v4.1-flash",
       "messages": [
         {
           "role": "user",
           "content": [
             { "type": "text", "text": "<结构化反推提示词系统指令>" },
             { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
           ]
         }
       ],
       "temperature": 0.2
     }
     ```
   - 提供可自定义的 `API Key` 与 `Base URL` 配置项，默认预填 DeepSeek 官方兼容端点，同时支持无缝切到用户自备的 Gemini / OpenAI / 本地端点。

## 后果 (Consequences)
- **极佳的用户体验**：DeepSeek v4.1 Flash 速度快、解析准、价格极便宜，极大降低了用户的使用门槛。
- **扩展性极强**：由于统一遵循 OpenAI 多模态格式，插件请求核心层高度纯粹，无需维护多套 SDK 胶水代码。
