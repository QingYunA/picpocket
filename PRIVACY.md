# Privacy Policy for PicPocket

The authoritative, up-to-date privacy policy is published at **https://www.picpocket.top/privacy**. This file is a short summary; if the two ever differ, the website version applies.

**Last updated: September 28, 2026**

- **Your library stays local.** Saved images, prompts, tags, folders and settings are stored in your browser (IndexedDB and `chrome.storage.local`). We don't run a server that stores them, and signing in doesn't upload them.
- **Your own API key goes straight to your provider.** With your own key, analysis and generation requests go directly from your browser to the AI endpoint you configured.
- **Hosted quota (optional).** If you use a redeem code instead of your own key, requests pass through our server (Supabase Edge Functions) to an upstream AI provider. Images, prompts and results are relayed in memory and not stored.
- **Account sign-in (optional).** You can sign in with Google, GitHub or an emailed one-time code. We keep an account record: email address, display name, avatar URL, sign-in method, that provider's user ID, and created / last-sign-in times. For Google we request only the `openid`, `email` and `profile` scopes. This information is used only to sign you in and provide account features, never for advertising, and is processed only by Supabase, Resend (sign-in emails) and the provider you choose. PicPocket's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.
- **No tracking, no selling.** No analytics, crash-reporting or advertising SDKs. We never sell your data or use it for advertising, credit or lending decisions.
- **Deletion.** Delete anything in the side panel at any time; uninstalling removes all local data. To delete your account or a redeem-code record, email support@picpocket.top and we will delete it within 30 days.

---

# PicPocket 隐私权政策（摘要）

完整且最新的隐私政策以 **https://www.picpocket.top/privacy** 为准。本文件只是摘要，两者如有出入，以网站版本为准。

**最近更新：2026 年 9 月 28 日**

- **灵感库只存在本地。** 收藏的图片、提示词、标签、文件夹和设置保存在浏览器中（IndexedDB 与 `chrome.storage.local`）。我们没有存储这些内容的服务器，登录也不会上传它们。
- **自己的 API Key 直连服务商。** 使用自己的 Key 时，反推和生图请求直接从浏览器发往你配置的 AI 接口。
- **托管额度（可选）。** 使用兑换码代替自己的 Key 时，请求会经过我们的服务器（Supabase Edge Functions）转发给上游 AI 服务商。图片、提示词和结果只在内存中中转，不会保存。
- **账号登录（可选）。** 可使用 Google、GitHub 或邮箱验证码登录。我们保留账号记录：邮箱地址、显示名称、头像地址、登录方式、该登录方式下的用户 ID，以及创建和最近登录时间。Google 登录只申请 `openid`、`email`、`profile` 权限。这些信息只用于登录和提供账号功能，绝不用于广告，仅由 Supabase、Resend（发送登录邮件）和你选择的登录服务商处理。PicPocket 对从 Google API 获取的信息的使用和传输，遵守 [Google API 服务用户数据政策](https://developers.google.com/terms/api-services-user-data-policy)，包括其中的“限制使用”要求。
- **不追踪，不出售。** 不集成任何统计、崩溃上报或广告 SDK；绝不出售数据，也不将其用于广告、征信或借贷决策。
- **删除。** 可随时在侧边栏中删除任何内容，卸载扩展会删除全部本地数据。如需注销账号或删除兑换码记录，请发邮件至 support@picpocket.top，我们会在 30 天内删除。
