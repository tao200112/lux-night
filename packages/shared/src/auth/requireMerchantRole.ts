import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { RequireUserOk } from './requireUser';

const ALLOWED_ROLES = ['owner', 'manager', 'staff', 'admin'] as const;

export type RequireMerchantRoleOk = RequireUserOk & {
  merchantIds: string[];
  venueIds: string[];
  role: string;
};

export type RequireMerchantRoleResult = RequireMerchantRoleOk | { response: NextResponse };

export async function requireMerchantRole(
  supabase: SupabaseClient,
  merchantId: string,
  roles: readonly string[] = ALLOWED_ROLES
): Promise<RequireMerchantRoleResult> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { response: NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', user.id).maybeSingle();
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin) {
  const { data: mids } = await supabase.rpc('my_merchant_ids');
  const { data: vids } = await supabase.rpc('my_venue_ids');
  return { user: { id: user.id, email: user.email }, profile, merchantIds: (mids ?? []) as string[], venueIds: (vids ?? []) as string[], role: 'admin' };
  }
  const { data: member, error: memberError } = await supabase
    .from('merchant_members')
    .select('id, role')
    .eq('merchant_id', merchantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (memberError || !member || !roles.includes(member.role?.toLowerCase())) {
    return { response: NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Insufficient merchant role' }, { status: 403 }) };
  }
  const { data: mids } = await supabase.rpc('my_merchant_ids');
  const { data: vids } = await supabase.rpc('my_venue_ids');
  return {
    user: { id: user.id, email: user.email },
    profile,
    merchantIds: (mids ?? []) as string[],
    venueIds: (vids ?? []) as string[],
    role: member.role ?? '',
  };
}

export function isRequireMerchantRoleOk(r: RequireMerchantRoleResult): r is RequireMerchantRoleOk {
  return 'user' in r && 'merchantIds' in r && !('response' in r);
}
