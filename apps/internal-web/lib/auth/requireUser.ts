'use server';
import { createClient } from '@/lib/supabase/server';
import { requireUser as requireUserBase, isRequireUserOk } from '@lux-night/shared/auth/requireUser';
import type { RequireUserOk, RequireUserResult } from '@lux-night/shared/auth/requireUser';

export type { RequireUserOk, RequireUserResult };
export { isRequireUserOk };

export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient();
  return requireUserBase(supabase);
}
