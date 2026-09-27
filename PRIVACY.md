# Privacy Policy for PicPocket

**Last Updated: September 18, 2026**  
**Effective Date: September 18, 2026**

PicPocket ("we", "our", or "the Extension") is committed to protecting your privacy. This Privacy Policy explains how PicPocket handles your information when you use our Chrome Extension.

PicPocket is designed with a **Privacy-First, Local-First** architecture. We do **not** collect, store, sell, or transmit any of your personal browsing history, visual data, or credentials to external servers operated by us.

---

## 1. Information We Access and Process

PicPocket operates entirely inside your local browser environment.

### A. Web Page Content & Images
- **Purpose**: To allow you to capture, crop, and collect design reference images from web pages you visit into your personal sidepanel moodboard.
- **Processing**: When you hover over an image to collect it, or use the interactive screen snippet tool, the image binary/data is extracted locally.
- **Storage**: All collected images, tags, notes, and color palettes are stored directly in your browser's local **IndexedDB** storage. **No images are uploaded to any developer-owned or third-party centralized server.**

### B. AI Vision & API Keys (BYOK - Bring Your Own Key)
- **Purpose**: To provide image-to-prompt visual reverse engineering (e.g., extracting subject, style, lighting, and composition) and AI image generation.
- **Storage**: Your custom API keys (e.g., DeepSeek, OpenAI, or other compatible endpoints) and base URLs are stored strictly in your browser's local `chrome.storage.local`. They are never synced or transmitted to our servers.
- **Transmission**: When you trigger visual analysis or image generation, requests are dispatched directly from your browser client to the corresponding AI service provider's endpoint that you have configured. Please refer to your respective AI provider's privacy policy for their data handling terms.

### C. Permissions Used
- `sidePanel`: Used to display the PicPocket workspace, moodboard waterfall, and prompt library seamlessly alongside your active webpage.
- `storage` & `unlimitedStorage`: Used to persist your collected images, custom tags, folder hierarchies, and client settings in local IndexedDB without browser quota constraints.
- `activeTab`: Used to inspect images on the current active tab only when you interact with the extension (e.g., hovering on images or collecting design inspiration).
- `contextMenus`: Used to provide quick-action right-click menus (e.g., "Collect Image to PicPocket", "Deconstruct Prompt with AI").
- `<all_urls>` (Host Permission): Required to enable content scripts to extract image blobs, detect image dimensions, and capture images across arbitrary websites where you choose to collect design inspiration.

---

## 2. Information We Do NOT Collect

- We do **NOT** collect your name, email address, phone number, physical address, or identity documents.
- We do **NOT** track, monitor, or record your web browsing history or search queries.
- We do **NOT** use tracking cookies, analytics SDKs (e.g., Google Analytics, Mixpanel), or fingerprinting mechanisms.
- We do **NOT** sell, rent, monetize, or trade any user data to data brokers, advertising networks, or third parties.
- We do **NOT** use or transfer your data for creditworthiness, lending, or personalized advertising purposes.

---

## 3. Data Retention and Deletion

All data created within PicPocket resides in your local browser profile:
- You can delete any individual image, folder, tag, or prompt at any time directly through the extension's user interface.
- You can clear all extension data at any time via Chrome's Settings (`chrome://settings/clearBrowserData`) or by uninstalling the extension. Once uninstalled, all local IndexedDB database records and cached images are permanently deleted by Chrome.

---

## 4. Third-Party Services

When you use AI analysis or image generation features:
- Requests are sent directly from your device to the API endpoint you specified (such as DeepSeek API or OpenAI API).
- We do not operate an intermediary proxy or relay server; your prompt queries and image payloads are transmitted directly between your browser and the AI provider under your own API credentials.

---

## 5. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect new features or regulatory requirements. Any updates will be posted to this repository with a revised "Last Updated" date.

---

## 6. Contact Us

If you have any questions or suggestions regarding this Privacy Policy or PicPocket's data practices, please open an issue on our GitHub repository:
- **GitHub**: [https://github.com/QingYunA/picpocket](https://github.com/QingYunA/picpocket)
- **Repository Issues**: [https://github.com/QingYunA/picpocket/issues](https://github.com/QingYunA/picpocket/issues)

---
---

# PicPocket 隐私权政策 (中文版)

**最近更新日期：2026 年 9 月 18 日**  
**生效日期：2026 年 9 月 18 日**

PicPocket（以下简称“我们”或“本扩展程序”）非常重视保护您的个人隐私。本《隐私权政策》旨在向您说明当您使用 PicPocket Chrome 扩展程序时，我们如何处理您的信息。

PicPocket 采用 **“隐私优先、本地优先 (Local-First)”** 的产品架构。我们**绝不会**向由我们运营的外部服务器收集、存储、出售或传输您的任何个人浏览历史、图片资产或账号凭据。

---

### 1. 我们访问与处理的信息

PicPocket 的所有核心功能均在您的浏览器本地客户端内部运行：

#### A. 网页内容与图片素材
- **用途**：允许您在浏览网页时，将灵感设计图片、局部框选截图一键收纳进侧边栏本地素材库。
- **处理方式**：当您将鼠标悬停在网页大图上点击采集，或使用框选截屏工具时，仅在本地提取该图片的二进制/数据内容。
- **存储机制**：所有采集的图片、分类标签、笔记与色彩卡片均直接持久化保存在您本机的浏览器 **IndexedDB** 数据库中。**任何图片均不会上传至开发者或任何第三方的中心化服务器。**

#### B. AI 视觉反推与 API 密钥 (BYOK)
- **用途**：提供将图片自动拆解为四维结构化提示词（主体、风格、光影、构图）及 AI 生图功能。
- **存储机制**：您自主配置的第三方大模型 API Key（如 DeepSeek、OpenAI 或其他兼容接口）及自定义 API Base URL 均严格保存在本地 `chrome.storage.local` 中，绝不回传至我们的服务器。
- **传输机制**：当您触发视觉反推或生图时，网络请求由您的浏览器客户端直接发送至您所配置的官方 API 服务端点。相关数据处理受您所使用的对应 AI 服务商隐私政策约束。

#### C. 所申请权限说明
- `sidePanel`：用于在网页侧边常驻呼出 PicPocket 工作台、瀑布流图库与提示词库；
- `storage` 与 `unlimitedStorage`：用于突破浏览器默认配额限制，将您采集的高清素材与提示词稳定持久化保存在本地 IndexedDB；
- `activeTab`：仅在您明确触发交互（如悬停识别采集）时，用于读取当前标签页内的图片元素尺寸与内容；
- `contextMenus`：用于在浏览器网页右键菜单中提供“采集到 PicPocket”等便捷捷径；
- `<all_urls>`（主机权限）：用于确保扩展能在您所浏览的各类灵感设计站点上正常提取图片资源。

---

### 2. 我们绝不收集的信息

- 我们**不收集**您的真实姓名、电子邮箱、手机号、实体住址或任何身份证明文件；
- 我们**不追踪、不记录、不监视**您的任何网页浏览历史记录或搜索引擎检索内容；
- 我们**不集成**任何第三方追踪 SDK（如 Google Analytics 等），不进行用户行为打点与设备指纹追踪；
- 我们**绝不出售、出租、转让或变现**任何用户数据；
- 我们**绝不**将您的数据用于征信评估、信贷审查或个性化商业广告投放。

---

### 3. 数据留存与彻底删除

在 PicPocket 中生成的所有数据均完全受您自主控制：
- 您可随时在侧边栏扩展界面中手动删除任意单张图片、文件夹、标签或提示词；
- 您亦可通过 Chrome 设置（`chrome://settings/clearBrowserData`）或直接卸载本扩展程序，即可一键彻底销毁本机 IndexedDB 中存储的所有图库数据及缓存。

---

### 4. 政策变更与联系方式

若本政策发生调整，我们将在 GitHub 开源仓库发布最新修订版本。如您对本隐私权政策有任何疑问、建议或合规反馈，请随时通过以下渠道联系我们：
- **GitHub 项目主页**：[https://github.com/QingYunA/picpocket](https://github.com/QingYunA/picpocket)
- **提交 Issue**：[https://github.com/QingYunA/picpocket/issues](https://github.com/QingYunA/picpocket/issues)
