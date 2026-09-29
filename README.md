<div align="center">

<img src="./public/icons/icon-256.png" width="128" height="128" alt="PicPocket Logo" style="margin-bottom: 12px;" />

# PicPocket

**网页灵感图片随身口袋、AI 视觉反推生图与 GitHub 开源提示词库工作台。**

常驻 Chrome 侧边栏，像 Pocket 一样随手收纳视觉资产，一键拆解为四维提示词并从开源词库重构生图。

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Built with WXT](https://img.shields.io/badge/Built%20with-WXT-black?style=flat-square)](https://wxt.dev/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-f59e0b?style=flat-square)](https://tailwindcss.com/)
[![License GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](./LICENSE)

</div>

---

## 为什么做这个？

平时在网页上看到一张惊艳的 AI 生图或设计素材，想要复刻它的提示词，通常要走一长串繁琐流程：
> 截图保存到桌面 ➔ 打开网页版大模型对话框 ➔ 上传图片 ➔ 敲字让 AI 描述 ➔ 得到一段啰嗦的文字 ➔ 自己再手动挑词改词。

**PicPocket 把整套动作直接做进了 Chrome 侧边栏的随身口袋：**
在网页上看到灵感，鼠标点一下或者框选局部，侧栏即可在 0.3 秒内把图片拆解为主体、风格、光影、构图四个维度的分词胶囊。点击单项秒复制，直接贴进 Midjourney、Flux 或 Stable Diffusion。更内置 GitHub 开源精选提示词库，随时反推、随时生图。

---

## 核心特性

- **交互式框选截屏:** 像 CleanShot 一样按住鼠标随意框选，黑白高反差选框，支持双击或回车一键采集。Retina 屏幕自动按设备物理像素比无损裁剪。
- **网页图片悬浮采集:** 鼠标悬停在网页任意大图上，右上角自动出现纯白采集胶囊，点击秒存本地图库。
- **双列常驻瀑布流:** 遵循 Notion / Apple 极简纯净亮色设计规范。后台自动生成 400px WebP 缩略图，千张素材滚屏恒定 60fps。
- **四维结构化提示词:** 多模态视觉模型直连，自动提取 **主体 (Subject)**、**风格 (Style)**、**光影 (Lighting)**、**构图 (Composition)** 与 **Master Prompt**。
- **单项即点即拷:** 每个提示词短语都是一个独立胶囊，点击即刻拷贝进剪贴板。
- **本地优先与隐私 (BYOK):** 自带 API Key（支持 DeepSeek 等 OpenAI 兼容接口），Key 与素材全部保存在浏览器本地 IndexedDB，不经过任何中转服务器。

---

## 本地安装与使用

### 1. 编译构建
```bash
# 安装依赖
bun install

# 编译扩展
bun run build
```
编译产物会生成到 `dist/chrome-mv3` 目录。

### 2. 加载到 Chrome
1. 打开 Chrome 浏览器，访问 `chrome://extensions/`；
2. 开启右上角的 **「开发者模式」** 开关；
3. 点击左上角 **「加载已解压的扩展程序」**；
4. 选择本项目中的 `dist/chrome-mv3` 文件夹。

### 3. 配置与体验
1. 点击浏览器工具栏的 **PicPocket** 图标固定并打开侧边栏；
2. 点击侧边栏右上角设置图标 ⚙️，填入你的 DeepSeek API Key（仅保存在本地存储）；
3. 浏览任意网页，通过右上角悬浮胶囊或顶部 `[截图采集]` 开始收录灵感。

---

## 技术架构

- **扩展框架:** [WXT](https://wxt.dev/) (Vite + Chrome Manifest V3)
- **UI 视图:** React 19 + TypeScript + Tailwind CSS v4 + Lucide React
- **本地数据库:** [Dexie.js](https://dexie.org/) (IndexedDB 本地持久化，支持响应式实时查询)
- **图像引擎:** `OffscreenCanvas` 像素级 Retina 裁剪 + Canvas 400px WebP 双轨画质

---

## 官方托管服务

扩展本体完全开源：在设置中填入自己的 API Key（BYOK）即可使用全部功能，不依赖任何 PicPocket 服务器。

「官方托管通道」（免配置 Key 的托管额度、兑换码，以及后续的账号与订阅）由闭源的私有后端提供。扩展与它之间的接口约定见 [`docs/api-contract.md`](./docs/api-contract.md)。

---

## 开源协议

版权所有 © 2026 PicPocket Team。本项目以 [GNU GPL-3.0](./LICENSE)（`GPL-3.0-only`）协议开源。

> 本次变更之前已发布的版本以 MIT 发布，那些版本仍可按 MIT 使用；此后的版本按 GPL-3.0。

内置的无限画布来自 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)（MIT），其原始版权声明与许可证保留在 [`vendor/infinite-canvas/LICENSE`](./vendor/infinite-canvas/LICENSE)，第三方组件清单见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

参与贡献前请阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。托管服务（账号、积分、支付）运行在独立的私有后端上，不在本协议范围内，两者只通过 [`docs/api-contract.md`](./docs/api-contract.md) 约定的 HTTP 接口通信。

**商标说明**：「PicPocket」名称与 Logo 不在 GPL-3.0 授权范围内。欢迎基于代码二次开发，但请勿使用 PicPocket 的名称或 Logo 发布衍生版本（包括上架 Chrome 应用商店）。
