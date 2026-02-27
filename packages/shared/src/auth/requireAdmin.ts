import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { RequireUserOk } from './requireUser';

export type RequireAdminOk = RequireUserOk & {
  adminClient: SupabaseClient;
};

export type RequireAdminResult = RequireAdminOk | { response: NextResponse };

export type CreateAdminClient = () => SupabaseClient;

export async function requireAdmin(
  supabase: SupabaseClient,
  createAdminClient: CreateAdminClient
): Promise<RequireAdminResult> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return { response: NextResponse.json({ ok: false, code: 'AUTH_ERROR', message: error.message }, { status: 401 }) };
  if (!user) return { response: NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', user.id).maybeSingle();
  const admin = createAdminClient();
  const { data: au } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  const { data: profRow } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  const allowlist = (typeof process !== 'undefined' && process.env?.ADMIN_EMAIL_ALLOWLIST || '')
    .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = au?.user_id != null || profRow?.is_admin === true || (user.email && allowlist.includes(user.email.toLowerCase()));
  if (!isAdmin) return { response: NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Must be admin' }, { status: 403 }) };
  return { user: { id: user.id, email: user.email }, profile, adminClient: admin };
}

export function isRequireAdminOk(r: RequireAdminResult): r is RequireAdminOk {
  return 'user' in r && 'adminClient' in r && !('response' in r);
}
