'use server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin as requireAdminBase, isRequireAdminOk } from '@lux-night/shared/auth/requireAdmin';
import type { RequireAdminOk, RequireAdminResult } from '@lux-night/shared/auth/requireAdmin';

export type { RequireAdminOk, RequireAdminResult };
export { isRequireAdminOk };

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  return requireAdminBase(supabase, () => createAdminClient());
}
