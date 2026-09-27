# 0007: AI 生图生命周期守护、参考图无损单例池与本地存储回溯体系

## 状态
已通过 (Accepted)

## 上下文与问题陈述
在 AI 生图工作台的实际高频使用中，暴露出三个影响数据完整性、存储性能与用户信任的关键痛点：
1. **生成进行中侧边栏关闭导致请求中断**：生图耗时通常 5~15 秒，在前端 Sidepanel 页面发起的网络连接会随用户收起侧边栏而被 Chrome 强制销毁 abort，导致未完成的任务凭空蒸发。
2. **大尺寸参考图的多任务重复拷贝膨胀**：用户上传或选定一张数 MB 的无损参考图进行连续微调生成时，若每个历史批次均深拷贝原图 DataURL，将造成几何级存储膨胀；同时，若为节省存储暗中有损压缩，又会破坏图生图的引导保真度。
3. **本地沙箱存储可见性与回溯诉求**：Chrome 扩展受沙箱限制，底层将数据存为二进制 LevelDB 碎片，用户无法通过系统文件管理器直接查阅原图或进行独立备份，缺乏掌控感。

## 决策 (Decision)

### 1. 动静分离与参考图无损单例池 (Reference Asset Deduplication)
- **参数与原图动静分离**：轻量级文本与表单配置（Prompt、Count、AspectRatio、NegativePrompt）存入 `chrome.storage.local`，保障毫秒级恢复；
- **100% 原始画质无损保真**：坚决杜绝静默有损压缩，参考图无损二进制直接写入客户端 IndexedDB；
- **单例引用去重池 (Content-Hash Pool)**：参考图独立按唯一哈希或资产 ID 存入 `referenceAssets` 表；历史生成任务流（`generationTasks`）仅弱引用其 ID。用户基于同一张 8MB 参考图连续生成 100 次，物理磁盘永远只占 1 份空间。

### 2. 存储透明度与一键本地备份回溯 (Storage Dashboard & Backup)
- **实时配额仪表盘**：调用原生 `navigator.storage.estimate()`，在设置面板可视化呈现 IndexedDB 已用容量与系统配额；
- **一键全量导出为 ZIP 备份包**：支持将 IndexedDB 中的所有高清原图（按文件夹分级）、生图历史记录及提示词一键打包生成标准 `.zip` 并触发浏览器下载；用户解压后即为标准文件系统目录，满足离线浏览、NAS 归档与云盘备份心智；
- **单向解耦与安全清理**：生图历史与正式口袋资产单向解耦；支持单独清空历史草稿图，绝不误伤用户正式收藏。

### 3. MV3 Service Worker 冻结生命周期与双流水线断点自愈 (SW Lifecycle & Dual-Pipeline Resilience)
- **MV3 空闲挂起 (Idle Teardown) 机制**：Chrome 扩展 MV3 规范下，后台 Service Worker 不具备常驻进程，在无活动事件约 30 秒后会被浏览器主动挂起休眠；重启后其全局内存变量（如 `activeGenerations` 与 `activeAnalyses` Map）将被彻底置空；前台 Sidepanel 在侧边栏收起时会被浏览器瞬间销毁。
- **生图与反推全面后台托管 (Dual-Pipeline Delegation)**：
  - **杜绝前台裸跑 fetch**：无论是 AI 生图还是多模态视觉反推，一律严禁在 Sidepanel 前台组件内直连网络；必须统一通过 IPC 委托给后台 Service Worker 执行并落盘；
  - **心跳守护**：长任务运行期间，Service Worker 启动 10 秒轻量级 API 轮询心跳（`chrome.runtime.getPlatformInfo()`），抑制浏览器的过早冻结；
  - **持久化状态原子存取**：任务启动即刻写入 `setActiveGeneration` / `setActiveAnalysis`，支持 `chrome.storage.local` -> `localStorage` -> `inMemoryStorage` 三层降级；
  - **断点状态自愈感知**：侧边栏重新挂载发起 `CHECK_GENERATION_STATUS` / `CHECK_ANALYSIS_STATUS` 时，若 Service Worker 处于重启后的冷启动状态（内存 Map 为空），自动从持久化 Storage 恢复有效任务感知。
- **启动纠偏自愈扫描 (Startup Reconciliation)**：
  - 侧边栏与后台启动时自动扫描数据库中所有处于 `analyzing` 或 `generating` 的中间态；
  - 若核对后台无对应活动任务且超出超时安全窗口（生图 5 分钟、反推 3 分钟），自动将悬挂卡片纠偏重置为 `pending` 或 `failed`，杜绝任何 UI 永久转圈死锁。
- **纯时间戳数学推导计时 (Zero-IPC Mathematical Continuity)**：
  - 前端耗时计时器严禁依赖每秒 IPC 消息递增广播（防止频繁 IPC 唤醒主线程并阻断信道）；
  - 统一采用数学绝对时间差推导：`Math.max(0, Math.floor((Date.now() - startTime) / 1000))`。无论侧边栏被反复收起/展开多少次，耗时与动画均直接精准对齐现实时间，零性能与内存开销。
- **显式取消与生命周期闭环**：
  - 生图与反推均配备显式的中断操作（`CANCEL_IMAGE_GENERATION` / `CANCEL_IMAGE_ANALYSIS`），物理 abort 网络连接并清理 Storage 记录，实现秒级响应与确定性状态闭环。
  - 请求层统一经 `withRequestTimeout` 组合「用户取消 + 超时」信号：反推 170s、单张生图 290s，均短于上述悬挂判定窗口，保证后台先于前台收敛。
- **前台降级例外 (Foreground Fallback Exception)**：
  - 仅当 Service Worker 不可达（IPC 失败）时，允许前台经 `runForegroundGenerationTask` 直连生图，这是「杜绝前台裸跑 fetch」的唯一例外；
  - 前台任务写入 `executor: 'foreground'`，取消时由前台（`useForegroundGeneration`）直接在本地落库 `cancelled`，因为后台收不到取消消息；
  - 后台冷启动自愈（`classifyGeneratingTask`）在 5 分钟有效窗口内跳过前台任务，超时仍未收敛（页面已关闭）则按悬挂任务纠偏为 `failed`，不产生永久死锁。

## 后果 (Consequences)
- **正面**：彻底消除生成任务与参考图膨胀隐患；原画质保真度 100% 得到捍卫；用户拥有对本地数据的绝对知情权与归档导出自由；侧边栏反复收发展开 100% 保持生图与反推连续执行，彻底杜绝任务假中断与卡死；卡片点击防误触，交互体验极大提升。
- **技术考量**：ZIP 打包由客户端内存动态流式生成，大图量导出需妥善管理内存与分片打包；后台任务状态需随任务完成或取消严格调用清理方法确保生命周期闭环。
