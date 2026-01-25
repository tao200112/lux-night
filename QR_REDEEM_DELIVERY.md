# 二维码与核销交付说明

## 1. 修改/新增文件清单

### 数据库 Migration
- `supabase/migrations/026_tickets_public_token_and_redeem_fields.sql` — 新增

### 后端 / API（customer-web）
- `apps/customer-web/app/api/tickets/public/route.ts` — 新增（GET 公开查票）
- `apps/customer-web/app/api/tickets/redeem/route.ts` — 新增（POST 核销，staff 校验+幂等）
- `apps/customer-web/app/api/stripe/webhook/route.ts` — 修改（创建票时写入 `public_token`）

### 前端（customer-web）
- `apps/customer-web/app/t/[token]/page.tsx` — 新增（公开票务页，扫码打开）
- `apps/customer-web/app/redeem/[token]/page.tsx` — 新增（核销页：三连击 + Redemption Guide）
- `apps/customer-web/app/ticket/[id]/page.tsx` — 修改（Show Ticket 进入 `/redeem/[token]`，移除旧 Staff 核销区块）
- `apps/customer-web/lib/data/tickets.ts` — 修改（`public_token`、`publicToken`、QR 内容改为 `${NEXT_PUBLIC_APP_URL}/t/${public_token}`，`redeemed_at`/`redeemed_by`）

### 配置
- `.env.example` — 新增 `NEXT_PUBLIC_APP_URL`

### 保留未删
- `apps/customer-web/app/api/tickets/[id]/redeem/route.ts` — 保留（旧核销，基于 `ticketId` + `checkin_ticket` RPC，可后续迁移或下线）

---

## 2. tickets 表 Migration SQL（摘要）

```sql
-- 026_tickets_public_token_and_redeem_fields.sql

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS public_token TEXT;

UPDATE public.tickets
SET public_token = encode(gen_random_bytes(16), 'hex') || substr(id::text, 1, 8)
WHERE public_token IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema='public' AND c.table_name='tickets'
               AND c.column_name='public_token' AND c.is_nullable='YES') THEN
    ALTER TABLE public.tickets ALTER COLUMN public_token SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_public_token ON public.tickets(public_token);

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redeemed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_redeemed_at ON public.tickets(redeemed_at) WHERE redeemed_at IS NOT NULL;
```

---

## 3. 关键前端代码片段

### QR 生成（`lib/data/tickets.ts`）

- QR 内容：`${getAppBaseUrl()}/t/${public_token}`，`getAppBaseUrl()` 优先 `NEXT_PUBLIC_APP_URL`，否则 `window.location.origin`。
- 生成图片：`generateQRCodeUrl(\`${base}/t/${token}\`)`（继续用 `api.qrserver.com`）。

### 公开页 `/t/[token]`（`app/t/[token]/page.tsx`）

- `GET /api/tickets/public?token=...` 取回：`eventName`、`venueName`、`startTime`、`entryBefore`、`accessTier`、`status`、`ticketId`（尾 8 位）、`redeemedAt`、`redeemedBy`。
- 无效 token：展示 “Invalid ticket”。
- `status=used` / `status=refunded`：不同样式（USED / REFUNDED 标签）。
- 仅当 `active` 时展示 “Redeem (Staff)” 链向 `/redeem/[token]`。

### 核销页 `/redeem/[token]`（三连击）

- 文案：“Staff only” 说明；大按钮 “Tap 3 times to Redeem” 与 `1/3`、`2/3`、`3/3`。
- 第 3 次点击：`POST /api/tickets/redeem`，`{ "token": token }`。
- 成功：展示 “Redeemed successfully” 或 “Ticket already redeemed”，以及 `redeemed_at`、`redeemed_by`（若有）。
- 非 staff（403）：提示 “Only staff can redeem. Please log in with a staff account.”，计数归零。
- 下方固定 “Redemption Guide”：亮度 100%、出示证件、指定入口等。

---

## 4. 核销 API 与权限

**POST /api/tickets/redeem**

- Body: `{ "token": string }`（`public_token`）。
- 从 Supabase Auth 取当前 `user`；未登录 → 401。
- 用 **service role** 按 `public_token` 查 `tickets` 并 join `events` 取 `merchant_id`。
- 权限：满足任一条即视为 staff：
  - `admin_users` 中存在 `user_id = user.id` 且 `is_active`
  - `profiles.is_admin = true`
  - `merchant_members` 中存在 `user_id`、`merchant_id`、`is_active` 且 `role IN ('staff','manager','owner','admin')`
- 非 staff → 403。
- 无此 `public_token` → 404。
- `status = 'used'` → 200，`{ "alreadyRedeemed": true, "ticket": { "redeemed_at", "redeemed_by" } }`（幂等）。
- `status = 'active'`：  
  `UPDATE tickets SET status='used', redeemed_at=NOW(), redeemed_by=user.id WHERE public_token=? AND status='active'`，再 `RETURNING`；  
  若 `status` 已非 `active`（并发导致 0 行更新），则再查一次按 “alreadyRedeemed” 返回 200。

---

## 5. 本地与线上验证步骤

### 环境

- `NEXT_PUBLIC_APP_URL`：本地如 `http://localhost:3000`，线上为 customer-web 的根 URL。
- 确保 `026_tickets_public_token_and_redeem_fields.sql` 已执行；Stripe 建票逻辑已包含 `public_token`。

### 1）扫码打开 `/t/[token]`

1. 从 Wallet → 某张票 → Ticket Details，看 QR；或用生成工具扫 QR。
2. 应打开：`{NEXT_PUBLIC_APP_URL}/t/{public_token}`。
3. 页面显示：活动名、场地、时间、票种、状态、票号尾 8 位；若 `used`/`refunded` 有对应样式。
4. 无效 token：显示 “Invalid ticket”。

### 2）Show Ticket → 核销页

1. Wallet → 某张票 → Ticket Details → 底部 “Show Ticket”。
2. 应跳转：`/redeem/[public_token]`。
3. 核销页：上方 “Tap 3 times to Redeem” 与 1/3、2/3、3/3；下方 Redemption Guide。

### 3）Staff 三连击核销

1. 使用 **staff** 账号登录 customer-web（该用户需在 `merchant_members` 的 `merchant_id` 与票所属 `events.merchant_id` 一致，且 `role` 为 staff/manager/owner/admin；或为 `admin_users` / `profiles.is_admin`）。
2. 进入 `/redeem/[token]`，连续点 3 次 “Tap 3 times to Redeem”。
3. 第三次应成功：展示 “Redeemed successfully” 及 `redeemed_at`（和 `redeemed_by` 若有）。
4. 再对同一 token 三连击：应 200 且 `alreadyRedeemed: true`，文案 “Ticket already redeemed”。

### 4）非 staff 返回 403

1. 使用 **非 staff** 账号（无 `admin_users`、`profiles.is_admin`，且无对应 `merchant_members` 的 staff/manager/owner/admin）。
2. 进入同一 `/redeem/[token]`，三连击。
3. 应收到 403，页面显示 “Only staff can redeem. Please log in with a staff account.”，计数归零。

---

## 6. 设计要点与约束

- **QR 内容**：仅 `{APP_URL}/t/{public_token}`，不含短 `ticketId`，避免枚举。
- **public_token**：至少 128-bit 随机（建票时 `randomBytes(16).toString('hex')` + 4 字节），表中 `UNIQUE`，创建票时必写。
- **核销**：仅 `POST /api/tickets/redeem` + `public_token`；权限仅在后端（admin/merchant_members/profiles.is_admin），前端 “Staff only” 仅为提示。
- **幂等与并发**：`UPDATE ... WHERE public_token=? AND status='active'`；已 `used` 或并发导致 0 行更新时，均按 “already redeemed” 返回 200。
- **范围**：改动仅在 customer-web 及上述 migration；未改 internal-web、admin-web，未破坏现有 Wallet/Ticket Details 除 Show Ticket 与 QR 以外的 UI。
