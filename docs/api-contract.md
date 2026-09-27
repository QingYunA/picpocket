# 托管服务接口约定 (Hosted Service API Contract)

PicPocket 扩展本体开源；**官方托管服务**（托管额度、兑换码、后续的账号与订阅）运行在私有后端上，源码不在本仓库。
扩展与托管服务之间只通过本文档约定的 HTTP 接口通信。

- 不使用托管服务时（在设置中自备 API Key，即 BYOK），扩展**完全不依赖**以下任何接口，所有功能照常可用。
- 托管服务地址与公开 key 见 `src/services/supabase.ts`，可通过 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 覆盖。
  其中的 `sb_publishable_…` 是设计上即公开的 key，访问权限由服务端的数据库权限规则（RLS）控制。
- **兼容性原则**：线上会同时存在新旧版本的扩展，服务端必须向后兼容。字段只增不删；需要破坏性变更时新增接口或版本号。

---

## 1. 兑换码核验 `verify_license`

```
POST {SUPABASE_URL}/rest/v1/rpc/verify_license
Content-Type: application/json
apikey: <publishable key>
Authorization: Bearer <publishable key>

{ "license_key": "PP-XXXX-XXXX" }
```

扩展通过 supabase-js 的 `supabase.rpc()` 调用，上面两个认证头由客户端自动附加。

按完整兑换码精确匹配，不存在列表或模糊查询。

**成功**：返回 0 或 1 行。

```json
[{
  "key": "PP-XXXX-XXXX",
  "tier": "pro",
  "total_quota": 3500,
  "remaining_quota": 3500,
  "vision_total_quota": 3000,
  "vision_remaining_quota": 3000,
  "image_total_quota": 500,
  "image_remaining_quota": 500,
  "expires_at": "2027-09-25T00:00:00+00:00",
  "note": "…"
}]
```

- 空数组：兑换码不存在。
- `expires_at` 早于当前时间：已过期。
- `vision_remaining_quota` 与 `image_remaining_quota` 都为 0：额度已用尽。

扩展侧实现：`src/services/billing.ts` → `activateLicenseKey`。服务端核验结果即最终结论，扩展**不存在任何本地激活规则**。

---

## 2. 托管 AI 代理 `ai-proxy`

```
POST {SUPABASE_URL}/functions/v1/ai-proxy
Content-Type: application/json
apikey: <publishable key>
Authorization: Bearer <publishable key>
x-license-key: <兑换码>
x-request-type: vision | image-generation     # 缺省为 vision

<OpenAI 兼容的请求体，原样转发给上游；服务端按 body.model 路由上游服务>
```

- `apikey` / `Authorization`：Supabase 网关要求的认证头（函数开启了默认的 JWT 校验），缺少时网关直接返回 401 `UNAUTHORIZED_NO_AUTH_HEADER`，请求不会到达函数。这里填公开 key 即可。
- `x-license-key`：决定扣哪一个兑换码的额度，是真正的身份凭证。

每次成功请求原子扣减 1 次对应类型的额度；上游失败（网络错误或非 2xx）会自动退回这次额度。

**响应**：上游的响应体与状态码原样返回，并附带剩余额度响应头：

```
X-Remaining-Vision-Quota: <剩余反推次数>
X-Remaining-Image-Quota:  <剩余生图次数>
X-Remaining-Quota:        <本次请求类型对应的剩余次数>
```

**错误**（响应体为 `{ "error": "<可读信息>" }`）：

| 状态码 | 含义 |
|---|---|
| 401 | 缺少 `x-license-key` |
| 403 | 兑换码无效、已过期，或对应类型的额度已用尽 |
| 500 | 服务端配置或额度服务异常 |
| 502 | 上游 AI 服务不可达（额度已退回） |

扩展侧实现：`src/services/billing.ts` → `DEFAULT_HOSTED_PROXY_URL`，以及 `src/services/ai.ts`、`src/services/imageGenerator.ts` 中的托管通道。

---

## 规划中（尚未上线）

账号登录（Google / GitHub / 邮箱）与订阅支付（Waffo Pancake、PayPal）上线后，将在此补充：

- 以登录令牌（Supabase Auth JWT）替代 `x-license-key` 作为 `ai-proxy` 的身份凭证，旧的兑换码请求头在过渡期内继续兼容；
- `create-checkout`：创建支付会话，返回付款页地址；
- `get-entitlement`：查询当前账号的会员状态与剩余额度；
- `get-plans`：获取当前在售的套餐与额度包。
