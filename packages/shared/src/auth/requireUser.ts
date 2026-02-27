import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export type RequireUserOk = {
  user: { id: string; email?: string };
  profile: { id: string; display_name?: string; avatar_url?: string } | null;
};

export type RequireUserResult = RequireUserOk | { response: NextResponse };

export async function requireUser(supabase: SupabaseClient): Promise<RequireUserResult> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    return { response: NextResponse.json({ ok: false, code: 'AUTH_ERROR', message: error.message }, { status: 401 }) };
  }
  if (!user) {
    return { response: NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', user.id).maybeSingle();
  return { user: { id: user.id, email: user.email }, profile };
}

export function isRequireUserOk(r: RequireUserResult): r is RequireUserOk {
  return 'user' in r && !('response' in r);
}
