import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { RequireUserOk } from './requireUser';

export type RequireVenueAccessOk = RequireUserOk & {
  merchantIds: string[];
  venueIds: string[];
};

export type RequireVenueAccessResult = RequireVenueAccessOk | { response: NextResponse };

export async function requireVenueAccess(
  supabase: SupabaseClient,
  venueId: string
): Promise<RequireVenueAccessResult> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { response: NextResponse.json({ ok: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', user.id).maybeSingle();
  const { data: venueIds } = await supabase.rpc('my_venue_ids');
  const ids: string[] = (venueIds ?? []).map((id: unknown) => String(id));
  if (!ids.includes(venueId)) {
    return { response: NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'No access to this venue' }, { status: 403 }) };
  }
  const { data: mids } = await supabase.rpc('my_merchant_ids');
  return { user: { id: user.id, email: user.email }, profile, merchantIds: (mids ?? []) as string[], venueIds: ids };
}

export function isRequireVenueAccessOk(r: RequireVenueAccessResult): r is RequireVenueAccessOk {
  return 'user' in r && 'venueIds' in r && !('response' in r);
}
