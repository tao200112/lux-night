'use server';
import { createClient } from '@/lib/supabase/server';
import { requireMerchantRole as requireMerchantRoleBase, isRequireMerchantRoleOk } from '@lux-night/shared/auth/requireMerchantRole';
import type { RequireMerchantRoleOk, RequireMerchantRoleResult } from '@lux-night/shared/auth/requireMerchantRole';

export type { RequireMerchantRoleOk, RequireMerchantRoleResult };
export { isRequireMerchantRoleOk };

export async function requireMerchantRole(merchantId: string, roles?: readonly string[]): Promise<RequireMerchantRoleResult> {
  const supabase = await createClient();
  return requireMerchantRoleBase(supabase, merchantId, roles);
}
