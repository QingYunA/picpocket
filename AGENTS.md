# PicPocket · 智能体与开发者协作规范 (Agent & Development Guidelines)

本项目支持且采用 **Git Worktree 多分支并行开发** 架构（不同特性可能在独立 worktree 中并行演进并陆续合入 `main` 分支）。为了确保所有协作智能体 (AI Agents) 及本地 Chrome 扩展产物的一致性，请严格遵守以下开发与同步纪律。

---

## 一、Worktree 远端同步与更新铁律 (Sync Protocol)

1. **任务开发前置检查 (Pre-flight Sync)**：
   - 任何 Agent 接手新任务或准备编写代码前，必须优先执行检查：
     ```bash
     git fetch origin main
     ```
   - 若本地分支落后于 `origin/main`，必须执行 rebase 同步最新提交，避免基于陈旧基线开发：
     ```bash
     git pull --rebase origin main
     ```
   - **Squash 上游同步指引**：若上游 PR 采用了 GitHub Squash and merge 合入，本地后续开发必须使用 `git rebase --onto origin/main <已合入的最后一个本地commit>` 精准剥离旧提交，避免陈旧提交重复重放引发虚假冲突。

2. **Chrome 扩展产物构建与刷新 (Build & Extension Update)**：
   - 必须确保用户本地加载的 `dist/chrome-mv3` 扩展包含了远端合入的最新功能。
   - 统一使用封装好的更新命令（自动拉取远端 -> 自动 rebase -> 测试 -> WXT 构建）：
     ```bash
     bun run update-ext
     ```
   - 若仅需同步远端代码而不触发打包，可使用：
     ```bash
     bun run sync
     ```

3. **代码推送前置检查 (Pre-push Check)**：
   - 推送代码到远端分支前，必须再次确保本地已 rebase 远端最新 `origin/main`，杜绝 `[rejected - non-fast-forward]` 报错或无意义的合并气泡 (Merge bubble)。

4. **Worktree 依赖与环境预检 (Worktree Dependency Gate)**：
   - 新建或切换进入新的 Git Worktree 特性目录时，必须首先检查并确保依赖已安装（若提示命令缺失或首度进入，务必执行 `bun install`），防止因缺少构建工具 CLI（如 `wxt`、`tsc`）导致假性构建失败。

---

## 二、构建与类型安全底线 (Type Safety & Build Gates)

1. **类型校验零容忍 (Zero-Error Typecheck)**：
   - 提交与构建前必须执行类型检查：
     ```bash
     bun run typecheck
     ```
   - 严禁忽略未导入变量（如 `db` 实例缺失）、隐式 `any` 或类型报错。WXT/Vite 打包时以 `bun run build`（已内置 `tsc --noEmit`）为硬性闸门。

2. **Chrome MV3 运行时红线守则 (MV3 Invariants)**：
   - **用户手势同步时机**：`chrome.sidePanel.open({ tabId })` **必须且只能**在点击事件回调的第一行**同步调用**；绝不能放在任何 `await` 之后，否则 Chrome 手势令牌过期将静默拒绝打开。
   - **DataURL 二进制转换**：Service Worker 环境中严禁使用 `fetch(dataUrl)`（会触发 `Failed to fetch` 崩溃）；必须统一使用纯内存二进制解码函数 `dataUrlToBlob()`。
   - **禁止原生阻塞弹窗**：严禁在侧边栏或扩展页面中使用 `window.alert`、`window.confirm`、`window.prompt`（会挂起侧边栏 JS 主线程并阻断消息通道），所有交互必须统一采用非阻塞式 UI 组件（如 `ConfirmModal`）。
   - **Blob URL 生命周期与跨模块隔离**：`URL.createObjectURL(blob)` 生成的临时 URL 强绑定于当前 JS 上下文与 Document 生命周期，且极易被父层 cleanup 的 `revokeObjectURL` 提前销毁；严禁跨抽屉、跨页面、跨组件层级传递短期 Blob URL 作为持久预览图。跨模块共享或落盘预览图时，必须统一使用 `readFileAsDataUrl(blob)` 提取 DataURL 或直接传递 IndexedDB 图片 ID，`img` 渲染需配备 `referrerPolicy="no-referrer"` 与优雅降级 `onError`。
   - **长连接与 IPC 监听状态解耦**：管理 Chrome 消息监听器（`chrome.runtime.onMessage.addListener`）或后台任务长轮询的 `useEffect`，严禁将秒级/高频递增的状态值（如 `elapsedSec`）放入依赖项数组（否则会引发每秒反复注销并重建监听通道的严重性能抖动与消息丢包）；必须使用 `useRef`（如 `elapsedSecRef`）对高频易变状态进行引用解耦。
   - **后台生命周期托管原则**：所有耗时网络长请求（AI 生图、视觉反推提示词等）**严禁在前台 Sidepanel 组件内直连 fetch**；必须统一通过 Chrome Runtime IPC 发送给后台 Service Worker 托管执行并维护保活心跳；前台组件只负责用户手势触发、断点状态对齐与视图渲染，杜绝侧边栏收起时请求被浏览器硬杀。
   - **网络预处理动静分离铁律 (Transient Preprocessing Invariant)**：任何出于网络带宽或网关体积限制（如 413 防御、图片预缩放、Exif 剥离）的瞬态数据变换，**严禁**在前台导入或状态流转阶段直接修改原图并持久化至 IndexedDB 或 Chrome Storage；必须且只能在发起实际网络长请求（Service Worker / Generator 层）的外发边界进行只读瞬态派生，确保本地数据库资产始终保留原始高保真数据（对齐 ADR 0007）。

3. **Sidepanel 视口与交互安全约束 (Sidepanel Viewport & Interaction Invariants)**：
   - **浮层边界约束**：侧边栏浮层（Dropdown/Popover/Tooltip）必须显式设定最大宽度限制（如 `max-w-[calc(100vw-24px)]`）并优先靠右对齐（`right-0`），严禁超出视口导致横向滚动条；
   - **弹性布局抗挤压**：顶栏及横向 Flex 容器中的关键标题与固定标识必须声明 `shrink-0` 与 `whitespace-nowrap`，杜绝被自适应元素挤压折行或截断；
   - **全局防横滑兜底**：侧边栏最外层滚动容器与全局 CSS 必须锁定 `overflow-x: hidden`；
   - **画廊卡片防误触隔离**：画廊网格卡片点击统一用于展开详情抽屉或多选勾选；严禁在缩略图上绑定直接打开全屏 Lightbox 或双击放大，大图查看仅保留在详情抽屉内部主动触发。

4. **国际化变更原子性与类型安全 (i18n Invariants)**：
   - **强类型守卫**：全项目 `t(path)` 入参受 `TranslationKey`（基于字典叶子节点递归推导）严格强约束。在组件中调用未经注册的 Key 或拼写错误时，`bun run typecheck` 将直接报错拦截，IDE 亦提供全量键名自动补全。
   - **原子性提交**：任何在前端 JSX 中新增或修改文案的操作，必须同步在 `src/i18n/locales/zh.ts` 与 `en.ts` 中完成双语定义。
   - **静态扫描测试兜底**：`bun run test` 内置全源码静态正则扫描断言，自动阻断任何漏注册的 Key 逃逸入库。

5. **存储持久化与任务自愈韧性规范 (Storage & Task Resilience)**：
   - **Storage 三层容错降级**：所有核心配置与运行时状态存取（如生图/反推任务进行态、草稿、用户设置），底层操作必须严格支持 `chrome.storage.local` -> `window.localStorage` -> 内存降级 (`inMemoryStorage`) 三层防御体系，严禁因宿主存储不可用或配额溢出抛出未捕获异常崩溃主业务。
   - **存储首屏水合防冲刷守卫 (Storage Hydration Guard)**：凡在组件挂载阶段通过异步 `chrome.storage.local.get` 恢复状态的模块，其负责持久化写入的 `useEffect` **必须且强制配备 `isStorageHydratedRef` 守卫**，在异步读取完成前严禁向持久层写入初始空状态（`[]` 或 `{}`），杜绝首屏竞态冲刷覆盖已存数据。
   - **后台任务自愈感知与断点重连**：委托给 Service Worker 的后台长任务（如 AI 生图、视觉反推），必须在侧边栏重新挂载时通过后台查询与 Storage 状态双向对齐，识别并纠正非正常中断的悬挂状态（stale dangling tasks），自动恢复耗时计时与进度感知；Service Worker 必须在冷启动时容错内存 Map 置空并向 Storage 核对有效时间窗口。
   - **全域悬挂状态启动自愈扫描**：所有具备中间执行态（`analyzing`、`generating`）的业务，前后台初始化时必须执行自愈纠偏扫描（Reconciliation），对无活动后台任务或超时的卡片自动重置为 `pending` 或 `failed`，杜绝永久死锁。
   - **零 IPC 数学绝对时间差连续性**：前台耗时显示严禁依赖每秒 IPC 广播或易变 state，统一采用 `Math.max(0, Math.floor((Date.now() - startTime) / 1000))` 进行数学推导，无论侧边栏收起展开多少次均精准对齐无抖动。

6. **AI 提示词工程与端到端保真铁律 (Prompt Synthesis & Tracing Invariants)**：
   - **检索前置原则 (Search-First on AI Standards)**：设计与重构生成式模型提示词时，严禁依赖滞后的预训练先验闭门造车，必须优先通过实时搜索调研业界顶流规范（如 FLUX.1 的 T5 自然叙事散文、Midjourney v6.1 镜头光学参数、JoyCaption 自适应高信息密度解构，彻底封禁 `photorealistic`、`masterpiece` 等 AI 塑料词）。
   - **保真直通与无损组装 (Lossless Synthesis)**：纯视觉反推模式下，底层装配引擎（`assembleMasterPrompt`）必须 100% 优先直通多模态模型生成的原生英文自然语言 `masterPrompt`；严禁在非降级场景下将其丢弃并退化为中文标签逗号串。
   - **全链路消费追踪 (Trace Through Consumers)**：修改或增强 AI 服务层输出时，必须端到端追踪消费该数据的下游 UI 组件（如 `InspectorDrawer` 的 `getMasterFlowPrompt()`、复制与一键带入生图工作台），确保高质量字段在中间链路未被意外吞噬或错误格式化。

7. **无限画布与全屏工作台视口分层规范 (Canvas & HUD Invariants)**：
   - **视口层 (Screen HUD) 与世界层 (World Canvas) 绝对物理隔离**：
     - **世界层**：仅允许承载画布内部实际图元（图片卡片、灵感便签等真实节点），随用户拖拽平移与滚轮缩放；
     - **视口层 (HUD)**：顶栏、控制台、抽屉、提示岛及空状态引导卡必须脱离世界变换层，固定在 `scale: 1.0` 屏幕视口内，严禁随画布缩放失真或平移被屏幕边缘裁切；
   - **CJK 字体排版防坍塌铁律**：
     - 绝对定位与 Flex 布局中承载中文字符的容器，必须显式声明定宽（如 `w-[380px]`）或声明 `whitespace-nowrap`，严禁让中文字符在未定宽的绝对定位容器中触发 CSS 2.1 shrink-to-fit `min-content`（单汉字 14px）竖排单列坍塌；
   - **视口浮层动态边界钳制与多分辨率适配**：
     - 所有支持拖拽的悬浮控件（如控制台）必须通过 `clampScreenPosition` 纯函数动态根据展开态（如 540px）与折叠态（如 48px）的高度计算 `maxX / maxY`，并监听 `window.onresize` 自动纠偏，杜绝大屏持久化坐标在小屏/分屏视口下掉入不可见死角；
   - **严禁向本地化函数反向匹配字面值推导业务状态 (No Fragile i18n Reverse-Inspection)**：
     - `t(key)` 仅用于视图层文案呈现，严禁通过 `t(key) === 'xxx'` 反向比对判定当前语言或驱动业务分支；判定语言必须直接使用 `useI18n()` 导出的强类型 `language === 'zh'`，门禁脚本 `check-i18n.ts` 将自动拦截此类违规。

---

## 三、常用命令清单

| 命令 | 说明 |
| :--- | :--- |
| `bun run update-ext` | **推荐**：拉取远端更新 + rebase + 类型检查 + 单元测试 + 生产编译扩展 |
| `bun run sync` | 仅检查并同步远端 `origin/main` 到当前工作区 |
| `bun run typecheck` | 运行 TypeScript 全量类型校验（`tsc --noEmit`） |
| `bun run test` | 运行静态文案校验（`check-i18n.ts`）与 Vitest 自动化单元测试 |
| `bun run i18n:check` | 运行全量中英文静态对称与源码键名扫描 |
| `bun x vitest run <path>` | 定向运行单个测试文件（如 `bun x vitest run src/utils/__tests__/foo.test.ts`） |
| `bun run dev` | WXT 开发热重载模式 |
| `bun run build` | 强制通过类型校验并直接构建生产扩展产物至 `dist/chrome-mv3` |
| `bun run mcp:install <target>` | 定向为指定 Agent（cursor/claude/antigravity/windsurf/zed/cline）注入 MCP 配置 |

---

## 四、扩展加载与调试路径 (Worktree Isolation & Mirror)

- **工作区独立隔离**：执行 `bun run build` 只构建当前工作树本地的 `dist/chrome-mv3`，严格杜绝自动覆盖主工作区（`main` 分支）产物，保障各特性工作树之间互不污染。
- **可选产物手动镜像 (`bun run mirror`)**：
  - 当开发者明确希望将当前 Worktree 特性分支的产物临时镜像同步给主仓库的 `dist/chrome-mv3` 用于单点调试时，可显式执行 `bun run mirror`；
  - 默认情况下所有构建行为均限制在当前工作树内部。

---

## 五、架构设计决策索引 (Architecture Decision Records)

- [`docs/adr/0007-ai-generation-lifecycle-and-persistence.md`](docs/adr/0007-ai-generation-lifecycle-and-persistence.md)：定义了生图历史生命周期、参数草稿与图片二进制的“动静分离”原则、MV3 Service Worker 冻结生命周期与前台数学断点自愈机制，以及参考图单例去重池（SHA-256）与分级目录 ZIP 离线备份规范。涉及 `src/db/`、`src/entrypoints/background.ts` 或 `src/utils/storage.ts` 修改时必读。
- [`docs/adr/0008-local-mcp-agent-collaboration.md`](docs/adr/0008-local-mcp-agent-collaboration.md)：定义了本地 MCP Bridge 与外部 AI Agent 双向 stdio/WebSocket 协同体系、权限控制模型与反漂移自适应接引规范。涉及 `packages/mcp-bridge/`、`src/services/mcpCollaboration.ts` 或 `src/services/mcpPrompts.ts` 修改时必读。
- **无限画布集成模块索引**：`vendor/infinite-canvas/web/src/integrations/picpocket/` 承载 PicPocket 资产与模型在画布内的核心适配层（`PocketCanvasAssets`、`PocketAssetPicker`、`pocket-adapter`）；`vendor/infinite-canvas/web/src/stores/use-canvas-side-panel-store.ts` 承载画布侧边栏视口状态与动态边界调度。


---

## 六、智能体实现与代码审查工作流铁律 (Implement & Review Workflow Invariants)

当智能体接手开发任务或用户发出 `/implement` 指令时，必须严格执行以下标准闭环流程，严禁跳步：

1. **需求与 Spec 边界守卫 (Spec Bounds Guard)**：
   - 严格按照用户需求、Approved Plan 或关联 Issue 进行开发，严禁臆测添加未授权的额外功能（杜绝 Scope Creep）；用户明确指示“没有就不要”的功能必须坚决剔除。
2. **关键缝隙 TDD 驱动 (TDD at Critical Seams)**：
   - 涉及核心纯函数、图形/矩阵变换（旋转、裁切、插值放大）、数据编解码及加解密逻辑，必须优先编写 Vitest 自动化单元测试（使用 `bun x vitest run <test_file>` 快速运行校验），以绿色断言作为质量底座。
3. **完成编码强制触发双轴代码审查 (`/code-review`)**：
   - 特性代码编写完毕且本地 `typecheck` / `test` 通过后，**必须强制触发 `/code-review` 流程**；
   - 必须派发两个**独立的并行子代理**（`Standards Reviewer` 与 `Spec Reviewer`），分别对照 `AGENTS.md` 工程守则与实际需求 Spec 执行审查，并原样输出两轴独立报告；
   - 严禁合并或遮掩审查报告中的问题。
4. **审查缺陷归零与原子提交 (Defect Zero Gate)**：
   - 审查中发现的任何规范违规（如漏写 `onError`、存储水合竞态）及 Spec 实现缺陷，必须在当前分支立刻闭环修复；
   - 再次通过 `bun run typecheck`、`bun run i18n:check` 与 `bun run test` 全量通过后，方可原子化提交（Commit）并创建 Pull Request 合入 `main`。

