/**
 * Internal Invites Data Queries
 */
import { createClient } from '@/lib/supabase/server';

export interface Invite {
  id: string;
  merchantId: string;
  venueId: string | null;
  intendedRole: 'OWNER' | 'MANAGER' | 'STAFF' | 'admin';
  token: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  disabled: boolean;
  createdAt: string;
  createdBy: string;
}

/**
 * 获取商户的邀请码列表
 */
export async function getInvites(merchantId: string): Promise<Invite[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((inv: any) => ({
    id: inv.id,
    merchantId: inv.merchant_id,
    venueId: inv.venue_id,
    intendedRole: inv.intended_role,
    token: inv.token,
    maxUses: inv.max_uses,
    usedCount: inv.used_count,
    expiresAt: inv.expires_at,
    disabled: inv.disabled,
    createdAt: inv.created_at,
    createdBy: inv.created_by,
  }));
}

/**
 * 创建新邀请码
 */
export async function createInvite(
  merchantId: string,
  intendedRole: 'OWNER' | 'MANAGER' | 'STAFF' | 'admin',
  maxUses: number,
  expiresAt: string,
  venueId?: string
): Promise<Invite> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('UNAUTHORIZED');
  }

  // TODO: Generate token
  const token = generateToken();

  const { data, error } = await supabase
    .from('invites')
    .insert({
      merchant_id: merchantId,
      venue_id: venueId || null,
      intended_role: intendedRole,
      token,
      max_uses: maxUses,
      used_count: 0,
      expires_at: expiresAt,
      disabled: false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error('CREATE_FAILED');
  }

  return {
    id: data.id,
    merchantId: data.merchant_id,
    venueId: data.venue_id || null,
    intendedRole: data.intended_role,
    token: data.token,
    maxUses: data.max_uses,
    usedCount: data.used_count,
    expiresAt: data.expires_at,
    disabled: data.disabled,
    createdAt: data.created_at,
    createdBy: data.created_by,
  };
}

/**
 * 兑换邀请码
 */
export async function redeemInvite(token: string): Promise<{
  merchantId: string;
  venueId: string | null;
  role: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('redeem_invite', {
    p_token: token,
  });

  if (error || !data) {
    throw new Error(error?.message || 'REDEEM_FAILED');
  }

  return {
    merchantId: data.merchant_id,
    venueId: data.venue_id || null,
    role: data.role,
  };
}

/**
 * 生成随机 token（8位随机字符）
 */
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
