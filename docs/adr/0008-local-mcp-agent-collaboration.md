# 0008: 本地 MCP 架构：双层桥接 (stdio + 本地 WebSocket) 与显式权限反馈协同

## 状态
已通过 (Accepted)

## 上下文与问题陈述
随着用户在 PicPocket 中积累的灵感素材与提示词（Prompt）日益增多，用户希望在外部 AI 编码与设计 Agent（如 Cursor、Claude Code、Windsurf 等）工作流中无缝复用这些资产：
1. **资产检索与任务匹配**：外部 Agent 接收到创作任务时，能直接检索用户私有库中的高质量提示词与风格积木；
2. **生图调度与自动入库**：Agent 能够控制生图参数（如指定 `16:9`、`2:3` 等画幅），并将生成结果自动回流归档到用户的指定文件夹中；
3. **文件夹与资产组织**：Agent 能主动创建分类文件夹并管理资产沉淀；
4. **技术限制与安全边界**：
   - Chrome MV3 沙箱内部无法直接监听任何 TCP/HTTP 端口（无 `listen()` 能力）；
   - 用户需要明确控制 Agent 的行为权限（特别是调用 API 扣费生图的高危操作）；
   - **反馈透明度要求**：若权限被拦截或配置缺失，必须向 Agent 提供可自愈的强语义错误响应，严禁出现“静默失败”导致 Agent 无法判断操作结果。

## 决策 (Decision)

我们决定采用以下组合技术架构：

### 1. 通信架构：双层桥接 (CLI stdio Bridge + 本地回环 WebSocket)
- 外部 Agent 通过标准 MCP `stdio` 协议启动轻量级本地中继脚本（`packages/mcp-bridge`，可在 `mcp.json` 中以 `bun run` 或 `npx` 运行）；
- 中继进程在本地监听 `127.0.0.1` 端口；PicPocket 扩展作为 WebSocket Client 主动连接；
- 握手阶段强制校验 `Origin: chrome-extension://<EXTENSION_ID>` 与本地动态配对 Token，杜绝跨站 WebSocket 劫持（CSWSH）。

### 2. 界面形态：紧凑状态触发器 + 协同控制抽屉 (Collaboration Drawer)
- 彻底摒弃“为了开窗口而开窗口”的机械设计，不在屏幕上增加沉重多余的独立空白大窗口；
- 侧边栏（Side Panel）顶栏空间极为紧凑，因此在右上角工具栏（设置按钮旁）增设一个 **28×28px 的单图标按钮**（带 🟢 连通 / ⚪ 离线状态灯）；
- 点击图标后，从右侧滑出半屏 **【AI 协同抽屉 (Collaboration Drawer)】**，承载连接状态、实时调用日志与权限开关。

### 3. 权限开关与自愈反馈机制 (Actionable Feedback Gate)
- 放弃拟人化名称，采用直观清晰的功能性开关：
  1. `[x] 允许读取资产与提示词 (Read)`
  2. `[x] 允许创建文件夹与写入提示词 (Write)`
  3. `[ ] 允许调用生图引擎生成图片 (Generate)`（默认需显式开启，防止消耗 API 算力）
- **强语义反馈承诺**：
  - 当权限被用户关闭时，MCP 响应返回带有明确指引的结构化错误信息（例如：`Permission 'generate' disabled. Please prompt user to enable it in PicPocket Sidepanel.`）；
  - 当生图成功时，返回详细的图片尺寸、耗时、沉淀文件夹 ID 与资产 ID，使 Agent 获得 100% 确定性的执行反馈。

### 4. 首期 MCP 工具集契约 (Tool Contracts)
- `search_prompts_and_assets`：语义与标签混合检索用户本地资产与提示词；
- `generate_and_save_asset`：调度生图工作台生成图片（支持 `16:9`、`1:1`、`9:16`、`2:3` 等画幅，并支持传入 `referenceAssetId` 库内资产或 `referenceImageUrl` 进行参考图垫图生成），并自动存入本地库与指定文件夹；
- `save_asset`：接收外部 Agent 已生成的图片与提示词并归档入库；
- `save_prompt`：沉淀提示词草稿与风格积木到本地词库；
- `manage_folders`：列出或创建目标分类文件夹；
- `update_tags`：支持对已有画廊资产或提示词进行标签追加或替换更新。

### 5. 国际化与类型安全纪律 (i18n & Type Safety Invariants)
- **强类型守卫**：全量前端组件文案通过 `t('mcp.xxx')` 绑定，受 `TranslationKey` 强类型约束；
- **双语原子同步**：所有新增文案必须同步在 `src/i18n/locales/zh.ts` 与 `src/i18n/locales/en.ts` 中以规范、地道的中英文完成原子性定义；
- **静态扫描门禁**：通过 `bun run i18n:check` 与 `bun run test` 确保无漏配、错配的词条。

### 6. 定向接引与 Anti-Drift 极速配置准则 (Targeted Setup & Anti-Drift Guardrails)
- **Anti-Drift 硬性红线**：生成的接引 Prompt 必须显式声明禁令（严禁运行构建、测试、安装依赖或修改无关源码），将外部 Agent 接引时间从数分钟压缩至 2 秒以内；
- **拒绝全量盲目注入 (Targeted Only)**：安装脚本与抽屉交互严格遵循“用什么注入什么”，支持精准命令行参数 (`cursor`, `claude`, `antigravity`, `windsurf`, `zed`, `cline`) 及交互单选，绝不篡改未授权客户端；
- **端口冲突自愈防御**：抽屉支持端口自定义，Bridge 支持 `--port` 参数解析与平滑防冲突排查提示。

## 后果 (Consequences)

### 正向影响
- **零侵入开箱即用**：无需注册系统 Native Messaging Host，无需配置操作系统注册表，完全跨平台；
- **掌控感与透明度**：用户在侧边栏随时掌控 Agent 权限，同时 Agent 在被拦截时能准确获悉原因并主动提醒用户；
- **资产飞轮闭环**：真正跑通“本地知识检索 ➔ Agent 生成 ➔ 资产自动回流”的自动化闭环；
- **极致轻量与安全**：定向注入避免配置污染，Anti-Drift 禁令彻底消灭外部 Agent 发散损耗。

### 负向与妥协
- 首次使用需在对应 Agent 配置文件中注入一次 Bridge CLI 启动命令（已由一键 Prompt 与定向脚本完全无感化）。

