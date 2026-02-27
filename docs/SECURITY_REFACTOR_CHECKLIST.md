# 统一权限基建层 - 修改清单

## 已新增文件

### packages/shared
- `src/auth/requireUser.ts`
- `src/auth/requireAdmin.ts`
- `src/auth/requireMerchantRole.ts`
- `src/auth/requireVenueAccess.ts`
- `src/server/rpc.ts`
- `src/auth/index.ts`（已追加 export）

### apps/admin-web
- `lib/auth/requireUser.ts`
- `lib/auth/requireAdmin.ts`
- `lib/auth/requireMerchantRole.ts`
- `lib/auth/requireVenueAccess.ts`
- `lib/server/rpc.ts`

### apps/internal-web
- `lib/auth/requireUser.ts`
- `lib/auth/requireMerchantRole.ts`
- `lib/auth/requireVenueAccess.ts`
- `lib/server/rpc.ts`

### apps/customer-web
- `lib/auth/requireUser.ts`
- `lib/server/rpc.ts`

---

## 待办：API route 迁移

以下 route 需改为使用封装，禁止直接 `supabase.auth.getUser()` 或 `supabase.rpc()`。

### admin-web
- `app/api/admin/uploads/poster/route.ts` → requireAdmin + callRpc
- `app/api/admin/places/status/route.ts` → requireAdmin
- `app/api/admin/invites/[id]/route.ts` → requireAdmin
- `app/api/admin/merchants/[id]/events/route.ts` → requireAdmin
- `app/api/admin/regions/route.ts` → requireAdmin
- `app/api/admin/events/[id]/route.ts` → requireAdmin
- `app/api/me/route.ts` → requireUser
- `app/api/admin/requests/[id]/approve/route.ts` → requireAdmin
- `app/api/admin/approvals/[id]/route.ts` → requireAdmin
- `app/api/admin/merchants/[id]/status/route.ts` → requireAdmin
- `app/api/admin/invites/route.ts` → requireAdmin
- `app/api/admin/drops/route.ts` → requireAdmin
- `app/api/admin/places/autocomplete/route.ts` → requireAdmin
- `app/api/admin/places/details/route.ts` → requireAdmin
- `app/api/admin/regions/[id]/route.ts` → requireAdmin
- `app/api/admin/ensure/route.ts` → requireAdmin
- `app/api/admin/drops/[id]/route.ts` → requireAdmin
- `app/api/admin/customers/route.ts` → requireAdmin
- `app/api/admin/ticket-types/[id]/prices/route.ts` → requireAdmin
- `app/api/admin/requests/[id]/reject/route.ts` → requireAdmin
- `app/api/admin/orders/[orderId]/route.ts` → requireAdmin
- `app/api/admin/settings/regions/route.ts` → requireAdmin
- `app/api/admin/regions/cities/route.ts` → requireAdmin
- `app/api/admin/exports/route.ts` → requireAdmin
- `app/api/admin/customers/[customerId]/route.ts` → requireAdmin

### internal-web
- `app/api/requests/route.ts` → requireMerchantRole
- `app/api/invites/redeem/route.ts` → requireUser
- `app/api/admin/event-change-requests/route.ts` → requireUser + is_admin RPC 或 requireAdmin（若抽到 lib）
- `app/api/merchant/event-change-requests/route.ts` → requireMerchantRole
- `app/api/invites/preview/route.ts` → requireUser
- `app/api/me/route.ts` → requireUser
- `app/api/invites/create/route.ts` → requireMerchantRole
- `app/api/invite/consume/route.ts` → requireUser
- `app/api/workspace/select/route.ts` → requireUser
- `app/api/tickets/redeem/route.ts` → requireVenueAccess 或 requireMerchantRole + callRpc
- `app/api/events/[id]/change-requests/route.ts` → requireMerchantRole
- `app/api/admin/event-change-requests/[id]/approve/route.ts` → requireAdmin 或 is_admin
- `app/api/admin/event-change-requests/[id]/reject/route.ts` → 同上
- `app/api/debug/event-change-requests/route.ts` → requireUser / requireAdmin

### customer-web
- `app/api/checkout/create-session/route.ts` → requireUser
- `app/api/tickets/redeem/route.ts` → requireVenueAccess / requireMerchantRole + callRpc
- `app/api/me/route.ts` → requireUser
- `app/api/profile/region/route.ts` → requireUser
- `app/api/profile/ensure/route.ts` → requireUser
- `app/api/public/checkout-v2/route.ts` → requireUser（若需登录）

---

## 写操作与 RPC 规范

- 所有写操作（insert/update/delete）必须在 server-only 文件（`*.server.ts` 或 `app/api/**` 内）。
- 所有 RPC 调用必须通过 `lib/server/rpc.ts` 的 `callRpc()`，禁止在 route 内直接 `supabase.rpc()`。
