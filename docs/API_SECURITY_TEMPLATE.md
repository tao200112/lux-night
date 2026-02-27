# 新增 API 安全模板

## Admin API（admin-web）

```ts
// app/api/admin/xxx/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin, isRequireAdminOk } from '@/lib/auth/requireAdmin';
import { callRpc, requireRpcOk } from '@lux-night/shared/server/rpc';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!isRequireAdminOk(auth)) return auth.response;
  const { user, adminClient } = auth;

  // 读表与 RPC 均用 adminClient，RPC 通过 callRpc 封装
  const result = await callRpc(adminClient, 'rpc_name', { p_id: '...' }, { userId: user.id, route: '/api/admin/xxx' });
  if (!requireRpcOk(result)) {
    return NextResponse.json({ ok: false, error: result.error?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: result.data });
}
```

## Merchant API（internal-web）

```ts
// app/api/merchant/xxx/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireMerchantRole, isRequireMerchantRoleOk } from '@/lib/auth/requireMerchantRole';
import { callRpc, requireRpcOk } from '@/lib/server/rpc';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const merchantId = body.merchantId ?? req.nextUrl.searchParams.get('merchantId');
  if (!merchantId) return NextResponse.json({ ok: false, code: 'MISSING_MERCHANT' }, { status: 400 });

  const auth = await requireMerchantRole(merchantId);
  if (!isRequireMerchantRoleOk(auth)) return auth.response;
  const { user, merchantIds, venueIds } = auth;

  const supabase = await createClient();
  const result = await callRpc(supabase, 'rpc_name', { p_merchant_id: merchantId }, { userId: user.id });
  if (!requireRpcOk(result)) {
    return NextResponse.json({ ok: false, error: result.error?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: result.data });
}
```

## Venue-scoped API（internal-web）

```ts
// app/api/merchant/venues/[id]/xxx/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireVenueAccess, isRequireVenueAccessOk } from '@/lib/auth/requireVenueAccess';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: venueId } = await params;
  const auth = await requireVenueAccess(venueId);
  if (!isRequireVenueAccessOk(auth)) return auth.response;
  const { user, venueIds } = auth;

  const supabase = await createClient();
  // 仅操作 venueIds 内资源
  const { data, error } = await supabase.from('table').select('*').eq('venue_id', venueId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
```

## Customer API（customer-web）

```ts
// app/api/xxx/route.ts
import { NextResponse } from 'next/server';
import { requireUser, isRequireUserOk } from '@/lib/auth/requireUser';
import { callRpc, requireRpcOk } from '@/lib/server/rpc';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!isRequireUserOk(auth)) return auth.response;
  const { user, profile } = auth;

  const supabase = await createClient();
  const result = await callRpc(supabase, 'rpc_name', { p_user_id: user.id }, { userId: user.id });
  if (!requireRpcOk(result)) {
    return NextResponse.json({ ok: false, error: result.error?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: result.data });
}
```

## 规则摘要

1. 禁止在 route 内直接 `supabase.auth.getUser()`，一律用 `requireUser` / `requireAdmin` / `requireMerchantRole` / `requireVenueAccess`。
2. 禁止在 route 内直接 `supabase.rpc()`，一律用 `callRpc(supabase, name, params, context)`。
3. 写操作仅允许在 server 环境（API route 或 `*.server.ts`）执行。
