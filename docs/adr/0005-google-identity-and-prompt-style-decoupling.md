# ADR 0005: Chrome 原生 Google 身份接入与文案/风格解耦提示词引擎架构

- **状态 (Status)**: 已采纳 (Accepted)
- **日期 (Date)**: 2026-09-18
- **决策者 (Deciders)**: 核心团队 & 用户
- **关联文档**: `CONTEXT.md`, `docs/adr/0004-image-generation-workbench-and-asset-flywheel.md`

---

## 1. 背景与问题陈述 (Context & Problem Statement)

在 PicPocket 的实机操作演进中，出现以下核心诉求与体验矛盾：
1. **商业化与免费定位冲突**：过早暴露 Pro 订阅与 PayPal 支付造成交互干扰，用户期望现阶段全量隐藏商业化界面，专注于纯净免费与极简自备 Key (BYOK) 的工具属性；
2. **账号体系诉求**：用户明确要求摒弃 GitHub 登录，直接接入全球通用的 **Google OAuth**，但扩展目前纯本地离线运行（Dexie IndexedDB），缺乏中心化云服务器；
3. **拖拽归档交互摩擦**：在仅 360px 的紧凑侧边栏中，拖拽卡片时无法自动弹开折叠的文件夹抽屉；且原生拖拽残影（Drag Ghost）为 4:3 巨大卡片，遮蔽了大部分视野；
4. **反推详情页语义模糊与风格复用障碍**：
   - 模型耗时对最终用户价值低，用户真正关心的是原图来自哪个网页；
   - 提取的四维积木仅作为零散复制按钮，缺少明确的交互归宿；
   - 创作者的核心心智是：**“看中了一张好图的美学风格，希望换成自己的文案重新生成”**，此前缺乏将“主体内容”与“艺术风格”解耦并一键套用的桥梁。

---

## 2. 决策驱动因素 (Decision Drivers)

- **去中心化与零运维**：不搭建复杂中心化后端，依靠 Chrome 原生能力实现零维护、低摩擦的 Google OAuth 身份鉴权；
- **纯净与无感**：完全剥离 Pro 营销侵扰，回归纯粹的创作者生产力；
- **拖拽微交互流畅度**：拖拽时抽屉即时展开、拖影做成超轻量条状胶囊（Compact Drag Pill）；
- **文案与风格解耦闭环**：反推后的文案可二次编辑，风格特征可交互式勾选，并提供双格式 Prompt 导出及一键跳转生图。

---

## 3. 架构设计与技术方案 (Architectural Solutions)

### 3.1 Chrome 原生 Google OAuth 鉴权体系 (`src/services/auth.ts`)
- 借助 Chrome MV3 `chrome.identity` API 与 Google OAuth 2.0 端点；
- 通过 `chrome.identity.launchWebAuthFlow` 或 `getAuthToken` 获得 Access Token，纯前端请求 `https://www.googleapis.com/oauth2/v2/userinfo` 提取 Profile（Email、姓名、头像）；
- 用户凭据持久化在 `chrome.storage.local`，Header 右侧显示圆角头像与注销抽屉，无任何外部服务器中转与数据上报风险。

### 3.2 拖拽悬浮条状胶囊 (Compact Drag Pill)
- 在 `CardItem.onDragStart` 中创建临时离屏 DOM 胶囊（高度 28px，半透明磨砂背景，包含 20px 圆角缩略图与单行文字）；
- 结合 `e.dataTransfer.setDragImage(ghostElement, 20, 14)` 彻底取代默认 4:3 笨重卡片残影；
- 拖拽启动同时触发 `setIsFolderNavOpen(true)`，实现文件夹无感呼出。

### 3.3 文案与艺术风格解耦引擎 (Content-Style Decoupling Engine)
- **主体文案编辑区**：将 `prompt.subject` 作为初始值置入文本框，支持用户任意重写；
- **交互式风格修饰芯片 (Modifier Chips)**：对 `style`、`lighting`、`composition` 标签赋予 Toggle Checkbox 语义（选中/反选）；
- **双 Prompt 格式输出与生图飞轮**：
  - **属性列表流 (Attribute Flow)**：输出带维度的属性清单文本；
  - **完整连贯流 (Master Flow)**：动态拼接【新文案 + 选中的全部风格修饰词】；
  - **一键套用生图**：将组装完成的 Prompt 直传至生图工作台。

---

## 4. 影响与收益评估 (Consequences)

### 正向影响 (Positive)
- **极致的风格复用效率**：创作者只需点选/改写主体，即可 100% 继承优秀设计图的光影与质感；
- **视觉干扰归零**：移除了所有与当前阶段无关的付费提示；
- **身份底座就绪**：Google OAuth 登录使得用户具备清晰的身份凭据，为未来多端同步打好基石。

### 负向影响与妥协 (Negative / Trade-offs)
- 纯客户端 Google OAuth 依赖 Chrome Identity 权限，扩展 Manifest 需声明 `identity` 与 `identity.email` 权限。
