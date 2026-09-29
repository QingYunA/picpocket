# Chrome Web Store 审核说明（Reviewer notes）

提交新版本时，可把下面的英文部分粘贴到开发者控制台的「测试说明 / Test instructions」。

## Test instructions (paste into the dashboard)

PicPocket works without an account. To test the core features:

1. Open any web page with images, right-click an image (or hover it and use the pill) → save it to PicPocket. Open the side panel to browse, tag and search it. Everything is stored locally (IndexedDB / chrome.storage.local).
2. Analysis and image generation need an AI endpoint. Two ways to try them:
   - Sign in from Settings → Account (Google, GitHub or an emailed one-time code). Signed-in accounts get 30 free hosted credits every month, which is enough to try image analysis and one or two generations on the "PicPocket" channel.
   - Or add your own OpenAI-compatible endpoint and API key under Settings → Models.
3. Paid plans and credit packs are optional. Checkout happens on Waffo Pancake or PayPal pages; the extension never handles card details.

Permissions and remote code: see https://www.picpocket.top/privacy. The extension bundles all of its code (`scripts/check-remote-code.ts` fails the build if remote code is referenced). Network calls only happen for the actions described in the privacy policy.

## Building from source

The extension is open source under GPL-3.0-only: https://github.com/QingYunA/picpocket

```bash
bun install --frozen-lockfile   # also installs the bundled Infinite Canvas app
bun run build                   # typecheck + canvas + extension → dist/chrome-mv3
bun run zip                     # produces the store package
```

Requires [Bun](https://bun.sh) ≥ 1.3. `vendor/infinite-canvas` is a modified copy of the MIT-licensed upstream (see `vendor/infinite-canvas/UPSTREAM.md`).

## 提审前自查

- `package.json` 与 `wxt.config.ts` 版本号一致
- 隐私政策与商店「隐私规范」声明一致（账号信息、付款信息由 Waffo / PayPal 处理）
- 主页与支持链接：https://www.picpocket.top 、support@picpocket.top
