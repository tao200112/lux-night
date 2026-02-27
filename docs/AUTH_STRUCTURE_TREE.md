# 统一权限基建 - 结构树

```
packages/shared/
├── src/
│   ├── auth/
│   │   ├── index.ts              # 统一 export auth
│   │   ├── requireUser.ts        # requireUser(supabase) → { user, profile } | response
│   │   ├── requireAdmin.ts       # requireAdmin(supabase, createAdminClient) → { user, profile, adminClient } | response
│   │   ├── requireMerchantRole.ts# requireMerchantRole(supabase, merchantId, roles?) → { user, profile, merchantIds, venueIds, role } | response
│   │   ├── requireVenueAccess.ts # requireVenueAccess(supabase, venueId) → { user, profile, merchantIds, venueIds } | response
│   │   ├── postAuthRedirect.ts
│   │   └── safeRedirect.ts
│   └── server/
│       └── rpc.ts                # callRpc(supabase, rpcName, params, context?), requireRpcOk(result)

apps/admin-web/
├── lib/
│   ├── auth/
│   │   ├── requireUser.ts        # requireUser() → 注入 createClient
│   │   ├── requireAdmin.ts       # requireAdmin() → 注入 createClient + createAdminClient
│   │   ├── requireMerchantRole.ts
│   │   └── requireVenueAccess.ts
│   └── server/
│       └── rpc.ts                # callRpc(rpcName, params, context?) → 注入 createClient

apps/internal-web/
├── lib/
│   ├── auth/
│   │   ├── requireUser.ts
│   │   ├── requireMerchantRole.ts
│   │   └── requireVenueAccess.ts
│   └── server/
│       └── rpc.ts

apps/customer-web/
├── lib/
│   ├── auth/
│   │   └── requireUser.ts
│   └── server/
│       └── rpc.ts
```

## 调用约定

| 场景           | 使用                     | 返回/失败      |
|----------------|--------------------------|----------------|
| 需登录         | `requireUser()`          | `{ user, profile }` / 401 |
| Admin 后台     | `requireAdmin()`         | `{ user, profile, adminClient }` / 401 | 403 |
| 商户维度       | `requireMerchantRole(merchantId[, roles])` | `{ user, profile, merchantIds, venueIds, role }` / 403 |
| 场地维度       | `requireVenueAccess(venueId)` | `{ user, profile, merchantIds, venueIds }` / 403 |
| RPC（默认会话）| `callRpc(rpcName, params, context?)` | `{ data, error }` |
| RPC（指定 client）| `callRpc(client, rpcName, params, context?)`（从 shared 引入） | 同上 |

## 强制规则

1. API route 内禁止直接 `supabase.auth.getUser()`，必须用上述 require* 之一。
2. 禁止直接 `supabase.rpc()`，必须用 `callRpc`（或 shared 的 `callRpc(client, ...)`）。
3. 写操作仅允许在 server（API route 或 `*.server.ts`）中执行。
