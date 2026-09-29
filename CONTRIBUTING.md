# Contributing to PicPocket

Thanks for your interest in contributing! / 感谢你愿意参与贡献。

## License of contributions / 贡献的授权

PicPocket is licensed under **GPL-3.0-only** (see [`LICENSE`](./LICENSE)).

By submitting a pull request or any other contribution to this repository, you agree that:

1. your contribution is licensed under **GNU GPL-3.0-only**, and
2. you grant **PicPocket Team** a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license
   to use, reproduce, modify, sublicense and distribute your contribution under other license terms,
   including commercial licenses (dual licensing). You keep the copyright in your contribution.

You also confirm that you have the right to submit the contribution and that it does not infringe any
third-party rights. If you do not agree, please do not submit contributions.

提交 PR 或任何贡献，即表示你同意：① 你的贡献按 GPL-3.0-only 授权；② 你授予 PicPocket Team 永久、全球范围、非独占、免版税、
不可撤销的许可，可以在其他许可条款（包括商业许可）下使用、修改、再授权和分发你的贡献；版权仍归你所有。
你同时确认有权提交该贡献，且不侵犯第三方权利。不同意请勿提交。

Code that you copy from other projects must carry a license compatible with GPL-3.0, and its origin and
license must be stated in the pull request.

## Trademark / 商标

The name "PicPocket" and its logo are not covered by the GPL. Please do not use them to publish derived
versions, including on the Chrome Web Store. / 「PicPocket」名称与 Logo 不在 GPL 授权范围内，请勿用于发布衍生版本（包括上架 Chrome 应用商店）。

## Development workflow / 开发流程

Working rules for both people and AI agents are in [`AGENTS.md`](./AGENTS.md). In short:

```bash
bun install
git fetch origin main && git pull --rebase origin main   # start from the latest main
bun run typecheck      # zero errors
bun run i18n:check     # zh / en dictionaries stay symmetric
bun run test           # static i18n scan + vitest + canvas tests
bun run build          # production build into dist/chrome-mv3
```

- Add or change UI text in **both** `src/i18n/locales/zh.ts` and `en.ts`.
- Write unit tests first for pure logic (transforms, encoding, pricing, parsing).
- Keep pull requests focused: one change per PR, no unrelated refactors.
- The hosted service (accounts, credits, payments) runs on a private backend; the extension talks to it only
  through the HTTP contract in [`docs/api-contract.md`](./docs/api-contract.md). The extension must keep working
  fully with a user's own API key.

## Reporting security issues / 安全问题

Please do not open a public issue for security problems. See [`SECURITY.md`](./SECURITY.md).
