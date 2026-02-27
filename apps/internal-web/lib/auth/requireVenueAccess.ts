'use server';
import { createClient } from '@/lib/supabase/server';
import { requireVenueAccess as requireVenueAccessBase, isRequireVenueAccessOk } from '@lux-night/shared/auth/requireVenueAccess';
import type { RequireVenueAccessOk, RequireVenueAccessResult } from '@lux-night/shared/auth/requireVenueAccess';

export type { RequireVenueAccessOk, RequireVenueAccessResult };
export { isRequireVenueAccessOk };

export async function requireVenueAccess(venueId: string): Promise<RequireVenueAccessResult> {
  const supabase = await createClient();
  return requireVenueAccessBase(supabase, venueId);
}
