# CONTEXT.md

本文档为项目的核心领域术语表（Glossary）与统一语言（Ubiquitous Language）。供所有设计、讨论、开发与代码实现共同遵守。

---

## 核心领域术语 (Core Domain Terms)

### 1. 资产与采集 (Asset & Ingestion)

- **Inspiration Item (灵感素材)**
  用户从任意网页收集并保存在本地的一项视觉资产。包含原图二进制（Blob）、缩略图（Thumbnail）、来源页面 URL、页面标题、抓取时间戳，以及可选的用户自定义标签。

- **Collector (采集器)**
  负责在网页端嗅探与提取图片的组件。当前阶段包含右键菜单采集（Context Menu）、拖拽采集（Drop Zone）；后续扩展 Hover 悬浮采集浮标与区域截图。

- **Local Vault (本地素材库)**
  基于浏览器原生 IndexedDB（Dexie.js）持久化存储的本地隔离数据库。保证用户图片资产完全停留在本地客户端，零云端上传，零泄密。

---

### 2. 交互界面与容器 (UI & Container)

- **Side Panel (常驻侧边栏)**
  基于 Chrome 114+ `chrome.sidePanel` API 构建的独立右侧停靠面板。在用户切换标签页或浏览不同网页时保持常驻，作为灵感沉淀与工作台的核心载体。

- **Masonry Grid (瀑布流画板)**
  侧边栏内承载 Inspiration Item 列表的双列自适应瀑布流布局。单卡片展示缩略图、反推状态徽章与快捷操作入口。

- **Prompt Drawer (反推抽屉面板)**
  点击特定图片后从侧边栏底部或覆盖层滑出的详情工作台。承载大图检视、模型选择、反推执行、结构化积木分块展示与一键复制出口。

---

### 3. AI 反推与结构化提示词 (Reverse Prompting & Blocks)

- **Reverse Prompting (视觉反推)**
  将灵感图片的视觉信息输入外部多模态大模型（Vision LLM），按特定结构提取并生成重现该风格或构图的文本提示词。

- **BYOK (Bring Your Own Key)**
  用户自带 API 凭据模式。用户在插件本地配置 API Key 与可选的 Base URL，插件纯前端直接发起 HTTPS 请求，不经由任何开发者第三方服务器中转。

- **DeepSeek v4.1 Flash**
  首发默认核心模型。具备原生视觉理解（Multimodal Input）与强劲的思维链/视觉推理能力，兼具极速响应与极致的 Token 经济性（约 $0.22/1M tokens），全面兼容 OpenAI 标准 Chat Completions 多模态格式。

- **Prompt Blocks (结构化提示词积木)**
  模型反推产物的解构单元。不输出未经排版的整段文字，而是明确拆解为：
  - **Copywriting & Typography (画面文案与排版)**：独立提取画面中的标题、标语、气泡文字及其字体风格（手写、衬线、粗无衬线）、色彩质感（3D微浮雕、霓虹发光）与空间机位（顶部弧形、居中堆叠）。
  - **Subject (主体与动作)**：剥离文字后的纯画面核心主体。
  - **Medium & Style (艺术媒介与画风)**：渲染引擎、媒介与艺术流派。
  - **Lighting & Mood (灯光与氛围)**：光影质感与环境氛围。
  - **Composition & Negative Space (构图机位与文字留白)**：版面网格与文字安全留白区。
  每个积木支持独立编辑与复制，亦可一键拼装为完整提示词。

- **Template Prompt Synthesis (文案解耦与动态占位符合成)**
  当用户替换画面文案时，系统采用模板占位符机制（如 `{{headline}}`），仅将新文案填入对应的排版与样式槽位，原始画风、构图与负空间描述 100% 保持锁定不变，实现零画风漂移的同款一键复刻。

- **Prompt Flavor (提示词风味/流派)**
  针对不同底层生图引擎的输出格式预设：
  - **Narrative Flow (叙述流)**：专为 GPT Image (DALL-E 3) 与 Gemini 优化，富含连贯语法的自然语言故事性描述。
  - **Tag Flow (标签流)**：专为 Midjourney、Flux 与 SD 优化，以逗号分隔的高权重视觉修饰词与参数。

---

### 4. 提示词库 (Prompt Library)

- **Prompt Sources (开源仓库源)**
  集成自 GitHub 知名开源提示词仓库（如 awesome-chatgpt-prompts、awesome-gpt-image 等）的规范化 Registry 源。经由 jsDelivr CDN 动态拉取与离线持久化。

- **Prompt Item (提示词条目)**
  提示词库中的单个视觉生成单元。包含完整提示词（Prompt）、四维特征积木（Subject, Style, Lighting, Composition）、封面/参考图（Cover URL）、标签集以及用户收藏状态（isFavorite）。

---

### 5. AI 生图工作台与资产飞轮 (Image Generation & Asset Flywheel)

- **AI Image Workbench (AI 生图工作台)**
  Chrome 侧边栏内的第 3 个核心一级 Tab 面板。提供提示词多行编写、画幅比例选择、参考图载入、风格修饰芯片、批次生成与调试历史。

- **Zen Mode Prompt Editor (沉浸式宽幅生图编辑器)**
  针对侧边栏狭小空间痛点设计的双模态提示词编辑体系。日常态支持弹性伸缩与垂直拖拽拉伸记忆；支持一键弹出宽幅沉浸式弹窗，配备长文排版、快捷清除、字数统计与风格注入工具栏。

- **Image Generation Protocol (生图通信协议)**
  遵循标准 OpenAI 兼容的 `/v1/images/generations` 与 `/v1/images/edits` 协议（支持 DALL-E 3、FLUX.1、Grok-Imagine 等主流模型），输入参数包括 `prompt`、`model`、`n`、`size`，返回 Base64 编码（`b64_json`）或直链（`url`）。

- **Reference Image Dual-Mode (参考图双模态)**
  在生图工作台携带图片时的两种行为：
  1. **Visual Reference (纯视觉对照)**：文生图模式，原图仅呈现在工作台侧边供用户直观对照生成前后的风格还原度。
  2. **Image-to-Image (垫图生成)**：若端点及模型支持，将参考图作为参数上传发起图生图或局部编辑。

- **Generation Task & History (生图任务与会话历史)**
  用户在生图面板中的实时生成批次记录。作为工作台内部的“草稿箱与调试田”，保留当前任务的参数、耗时及候选图片。

- **Asset Sinks (资产沉淀通路)**
  生图成品离开草稿箱、正式流转入库的显式路径：
  1. **Gallery Sink (沉淀至灵感画廊/我的口袋)**：将满意图片生成 400px WebP 缩略图并存入本地 `items` 表，分类标记为 `['AI生图']`，支持后续全屏查看与二次反推。
  2. **Library Sink (沉淀至提示词库)**：将 Prompt 与生成图绑定存入 `promptItems` 表，沉淀为个人私藏提示词。

- **Reference Asset Pool (参考图单例去重池)**
  针对垫图（Image-to-Image）的无损去重存储机制。参考图原图以原始无损二进制（Blob/DataURL）独立入库，历史生成批次仅弱引用其资产 ID。彻底杜绝基于同一大图微调生成时的存储重复膨胀，100% 捍卫模型视觉引导保真度与用户知情权。

- **Storage & Backup Dashboard (本地存储与全量备份中枢)**
  基于浏览器原生 `navigator.storage.estimate()` 的透明化容量监测与导出系统。实时可视化呈现本地已用容量与剩余配额；支持一键将本地素材、生图历史与提示词打包导出为结构化离线文件，打破浏览器沙箱屏障，满足用户本地回溯、迁移与物理冷备份心智。

---

### 6. 我的口袋与多级文件夹系统 (My Pocket & Multi-Level Folders)

- **My Pocket (我的口袋)**
  原“灵感画廊”升级而来的个人核心素材管理中枢。承载用户从网页采集、本地导入或 AI 生图沉淀的所有视觉资产。

- **Folder Item (文件夹实体)**
  本地 Dexie 数据库 `folders` 表中的目录单元。支持无限层级嵌套树状结构（`parentId` 自关联），具备独立的排序（`order`）与时间戳。

- **Folder Cascading Strategy (文件夹级联删除与安全回收策略)**
  删除父文件夹时，系统自动递归查找并清理其所有嵌套子文件夹；同时将所包含的灵感素材（Inspiration Items）的 `folderId` 重置为 `null`，自动归入“未归档/全部素材”，杜绝误删用户原始资产。

- **Drag-and-Drop Organization (卡片拖拽归类)**
  基于 HTML5 原生 Drag-and-Drop 规范。用户在瀑布流画板中长按拖拽任意灵感卡片，拖入侧边导航抽屉的任意目标文件夹，实现毫秒级即时归档与视图响应。

---

### 7. 官方精选提示词库与来源隔离 (Curated Registry & Source Isolation)

- **Curated Prompt Registry (PicPocket 官方精选提示词库)**
  内置于扩展内部的本地化极速提示词仓库（`local://picpocket-curated`）。包含赛博朋克人像、北欧极简静物、新海诚动漫积雨云、3D 黏土岛屿等前沿主流风格，内置 100% 结构化四维积木与推荐采样参数，零外部网络依赖，首次打开即刻秒开。

- **External Source Isolation (外部开源源隔离与按需开关)**
  外部社区开源源（如 awesome-chatgpt-prompts 等）默认处于关闭（`enabled: false`）状态。用户可进入设置面板按需开启并配置刷新周期，防止因第三方仓库改动或网络抖动影响核心体验。

---

- **Pure Free & BYOK Mode (纯净免费与自备 Key 模式)**
  回归工具纯粹性。前端全量隐藏所有商业化 Pro 徽章、付费订阅套餐及 PayPal 支付弹窗。用户自备 API Key（如 DeepSeek、OpenAI、SiliconFlow、CheaperInference 等）即可完全免费、无限制享受视觉反推、提示词库管理与 AI 生图能力。

---

### 9. Google 身份鉴权与用户态 (Google Identity & Profile)

- **Chrome Native Google Auth (Chrome 原生 Google 鉴权)**
  基于 Chrome MV3 原生 `chrome.identity` API（`getAuthToken` / `launchWebAuthFlow`），实现免后端依赖的单点授权登录。
- **User Profile State (用户身份凭据与会话)**
  前端持久化当前登录用户的 Google 邮箱、公开头像与昵称。在 Header 右侧呈现轻量用户头像与状态菜单，为未来多设备云端备份及协同提供无缝身份载体。

---

### 10. 条状拖拽胶囊与抽屉自动展开 (Compact Drag Pill & Auto-Expanding Folders)

- **Compact Drag Pill (条状拖拽胶囊)**
  长按卡片启动拖拽时，通过 `dataTransfer.setDragImage` 动态注入的轻量横向悬浮胶囊（高度约 28px，内含圆角图片微缩图、单行截断标题与归档指示）。彻底替代浏览器默认的 4:3 巨大卡片残影，避免拖拽时遮挡侧边栏有限的可视区域。
- **Auto-Expanding Folder Nav (拖拽自动呼出文件夹)**
  当拖动动作启动（`dragstart`）时，若侧边目录抽屉当前处于折叠状态，系统立即自动触发平滑展开（`isFolderNavOpen = true`），将全部多级目标文件夹呈现在用户视野内，实现丝滑的拖放归档。

---

### 11. 文案与风格分离引擎 (Content & Style Decoupling Engine)

- **Content & Style Decoupling (文案与艺术风格解耦)**
  视觉反推产物不再是不可拆分的铁板一块，而是被精确区隔为两大部分：
  1. **Subject Content (文案主体)**：画面描述的核心内容（例如“一只在霓虹雨夜中喝咖啡的柴犬”），提供原生可编辑输入框，允许用户在反推后任意自由篡改（例如改写为“一只穿宇航服的波斯猫”）。
  2. **Style Aesthetics (艺术风格与构图积木)**：从画面中提炼出的纯粹美学修饰词集（画风媒介、光影氛围、机位构图），以交互式芯片（Modifier Chips）呈现。
- **Style Modifier Chips (交互式风格修饰芯片)**
  每个风格、光影与构图标签支持用户独立点击开启/关闭（Toggle Selection），直观掌控最终提示词要继承的风格维度。
- **Dual Prompt Flows (双风味提示词流)**
  针对不同 AI 创作者的操作习惯，提供双通道一键导出：
  1. **Attribute Flow (属性列表流)**：格式化结构清单（如 `主体: 一只穿宇航服的波斯猫 | 画风: 赛博朋克, 3D超写实 | 光影: 霓虹背光 | 构图: 85mm微距`），便于精细化参数调优与文档沉淀。
  2. **Master Flow (完整连贯流)**：将新文案与选中的风格特征融会贯通为自然语言大段提示词，专为 Midjourney、Flux 与 DALL-E 3 优化。
- **Style Transfer to Generation (套用风格一键生图飞轮)**
  反推详情页的核心行动点。点击后自动提取【用户新改写的主体文案】与【当前勾选的艺术风格参数】，自动装载进「AI 生图」工作台并无缝切换，实现从“看别人的好图”到“改文案套用好风格并立即出新图”的闭环。

---

### 12. 采集流转与批量整理系统 (Ingestion Flow & Batch Organization)

- **Inbox-First Principle (收件箱优先原则)**
  所有从网页右键、拖拽或截图新采集的资产，默认作为未分类条目（`folderId: undefined`）存入素材收件箱（Inbox），确保采集行为高度可预测且不污染任何特定文件夹上下文。
  _Avoid_: 强制篡改活跃文件夹, 静默归档

- **In-Context Filing Pill (就地归档动态胶囊)**
  当用户停留在特定文件夹（如 `222`）时，新资产入库不打断当前浏览，而在侧边栏顶部浮现毫秒级轻量操作胶囊，提供一键“移入当前文件夹”与“查看新素材”的能力。

- **Webpage Quick-Filing Capsule (网页端悬浮归档胶囊)**
  用户在网页端触发右键采集后，网页右下角弹出的极低侵入度微型浮动胶囊（默认 3 秒静默淡出）。用户可在不打开侧边栏的情况下，一键快捷更改目标归档文件夹。

- **Batch Selection Mode (批量整理模式)**
  侧边栏素材列表的多选管理状态。激活时卡片点击行为转为勾选切换，底部浮现固定操作栏，支持跨素材批量移动归档、批量删除与多卡合并拖拽。

- **Card Action Menu (卡片快捷操作菜单)**
  单张素材卡片的上下文菜单（支持右键呼出与卡片右上角 `...` 触发）。提供直达目标文件夹的移动选择器、反推、复制与删除入口，替代单调的鼠标拖拽。

---

### 13. 就地模型选择与生图飞轮 (In-Situ Model Switching & Generation Flywheel)

- **In-Situ Model Switcher (就地模型选择胶囊)**
  将模型切换能力从深层的“设置弹窗”彻底释放至生图工作台与反推抽屉的核心操作流。以轻量紧凑胶囊（Pill Button）呈现当前模型品牌矢量图标与模型名称，点击呼出支持 Base URL 可用模型动态拉取、预设推荐快速点选与模糊搜索的高层级浮层。切换后即时生效并同步持久化回写至 `UserSettings`。

- **Multi-Reference Tray (多参考图托盘)**
  生图工作台内置的参考图容器。打破原有仅能携带单图的局限，深度对齐 Infinite Canvas 体验：支持从系统剪贴板一键粘贴、本地文件拖拽投掷或批量上传，支持多图微缩展示、顺序调整与独立移除。

- **Result-to-Reference Flywheel (产物反哺与迭代生图闭环)**
  生图工作台生成结果卡片提供的核心行动点。用户对生成结果满意但需微调时，可一键将结果图直接推入多参考图托盘作为垫图底图，开启下一轮精细化图生图迭代，实现“反推 ➔ 生图 ➔ 垫图迭代 ➔ 沉淀”的完整飞轮。

- **Generation Quality & Extended Aspect Ratios (生图画质分级与扩展画幅)**
  对齐专业生图参数控制：引入清晰度分级（`Auto` / `Standard` / `HD`），画幅比例扩展支持超宽电影画幅（`21:9`，1792×768）与经典竖版海报（`2:3`，768×1152），并在折叠高级区提供多批次生成张数（`1` / `2` / `4`）与负面提示词（Negative Prompt）精准控制。

---

### 14. 本地 MCP 与 Agent 协同体系 (Local MCP & Agent Collaboration)

- **Collaboration Hub (AI 协同中枢)**
  PicPocket 插件内面向外部 AI Agent（如 Cursor、Claude Code、Windsurf 等）的连接管理、状态感知与权限控制中枢。不增设沉重独立的空白窗口，而是以轻量抽屉或面板形态存在，保障状态可知与权限可控。

- **Collaboration Status Trigger (协同状态触发器)**
  位于侧边栏顶栏右侧工具栏（与设置图标并列）或悬浮位置的微型状态图标按钮。紧凑占用空间（约 28×28px），以点灯状态标识当前连接（⚪ 离线 / 🟢 连通 / 🔴 异常），点击呼出协同配置抽屉。

- **Access Level (权限控制级别)**
  用户主导的功能授权体系，严格限定 Agent 对本地数据的操作边界：
  1. **Read-Only (只读)**：仅允许检索与读取本地素材、提示词库与反推积木，严禁写入。
  2. **Read & Write (读写)**：在只读基础上，允许 Agent 沉淀新提示词、创建分类文件夹与更新标签；禁止消耗 API 算力生图。
  3. **Full Access (完全控制)**：允许 Agent 自主调度生图引擎（指定画幅如 16:9、模型）、生成并自动沉淀资产入库。

- **Local MCP Bridge (本地桥接进程)**
  运行在用户操作系统本地的轻量级中继进程（`picpocket-mcp`）。对外遵循标准 MCP `stdio` 协议与 Agent 通信，对内通过受保护的本地回环 WebSocket（`127.0.0.1` + 动态 Token 握手）与插件双向协同。

- **In-Situ Ingestion Flywheel (Agent 生图沉淀飞轮)**
  Agent 依据外部创意任务，先检索插件中积累的优质 Prompt 与风格积木，构造目标参数并调度生图工作台生成图片，成品自动归档至指定的文件夹（如 16:9 比例电影级场景），实现“知识复用 ➔ Agent 生成 ➔ 资产自动回流”的自动化闭环。

---

### 15. 独立全屏生图工作台与画布演进 (Standalone Workbench & Canvas Evolution)

- **Standalone Workbench (独立全屏生图工作台)**
  基于 WXT 独立 Entrypoint（`workbench.html`）构建的宽屏创作空间。彻底摆脱侧边栏 380px 的物理挤压，赋予用户在大屏幕上自由漫游与创作的完整视野。

- **Simple Infinite Canvas (轻量无限画布)**
  参考 `basketikun/infinite-canvas`（MIT 协议）构建的二维无限平移与缩放网格画布。主生图控制台与候选生成图片作为自由节点卡片浮动在画布上，支持鼠标自由拖拽重新排布、滚轮平滑缩放与 Space 抓手平移。

- **Singleton Workbench Tab (单例工作台标签页)**
  在侧边栏唤起独立工作台时采用的单例防重开机制。检测当前浏览器窗口中是否已有处于打开状态的 `workbench.html` 标签页，若存在则直接聚焦切换（Activate），避免重复开出海量僵尸标签页。

- **Seamless Draft Hand-off (草稿无损接力)**
  侧边栏与独立工作台之间的状态传递管道。用户在侧边栏编辑的 Prompt、参考图托盘与当前选中的模型参数，在点击全屏唤起时通过本地持久化（`chrome.storage`）安全暂存；大页面通过响应式 Storage onChanged 监听，结合非破坏性询问胶囊让用户决定是否载入，确保创作现场与长任务零中断。

- **Node Cards & Flywheel (卡片节点与垫图闭环)**
  画布上的生成图片卡片，支持双击原始大图放大检视、一键安全存入本地图库、以及设为垫图主参考图继续衍生创作的飞轮闭环。

- **Pure Stage & Pocket Drawer (纯净台面与口袋抽屉)**
  画布创作与资产管理的解耦架构。画布保持纯净的“创作现场台面（Workspace Stage）”，杜绝将图库成百上千张杂乱素材自动铺满画布；左侧配置轻量可折叠「口袋资产抽屉（Pocket Drawer）」，用户可随时翻阅历史收藏，并直接拖拽（Drag & Drop）至画布任意坐标作为参考垫图或对比节点。

- **Text Sticky Node (灵感便签节点)**
  画布上的自由文本卡片。支持在画布空白处双击或点击工具栏快捷创建，用于记录画面构思、修饰词备忘、多方案标题或对比注释。

- **Canvas Image Tools (卡片轻量二次编辑)**
  内置在图片节点头部的纯本地轻量处理套件。包含自由比例裁切（Crop）、直角旋转（Rotate）与高清放大（Upscale），无需依赖笨重外部模型即可就地调正构图与比例。

- **Marquee Selection & Snapshot Export (框选多选与快照导出)**
  画布级批量排版与成果分享能力。支持鼠标拉框批量多选移动或删除卡片；支持将当前画布视口排布的全部或选中卡片一键拼接导出为高清 PNG 快照（Snapshot）。

- **Canvas Dual Theme (画布明暗双模)**
  画布视口的明暗主题体系。支持一键在科技暗黑与象牙白纸质点阵之间无缝切换，卡片阴影与边框自动适配，实现与 Chrome 侧边栏及白天办公环境的原生视觉契合。





