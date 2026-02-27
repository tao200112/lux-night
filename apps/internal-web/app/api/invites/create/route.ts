/**
 * POST /api/invites/create
 * 创建邀请码（仅 owner/manager/admin）
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

/**
 * 验证 UUID 格式（v1 或 v4）
 * @param v 待验证的值
 * @returns 是否为有效的 UUID
 */
function isValidUuid(v: any): boolean {
  if (!v || typeof v !== 'string') {
    return false;
  }
  
  // 检查是否为字符串 "null"
  if (v === 'null' || v === 'NULL') {
    return false;
  }
  
  // UUID v1/v4 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v);
}

export async function POST(req: Request) {
  try {
    const rl1 = await rateLimitOrResponse(req, rateLimitPolicies.publicBurst, { userId: 'anon' });
    if ('response' in rl1) return rl1.response;

    const supabase = await createClient();
    
    // 验证用户已登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'User must be authenticated' },
        { status: 401 }
      );
    }

    const rl2 = await rateLimitOrResponse(req, rateLimitPolicies.loginOrInviteRedeem, { userId: user.id });
    if ('response' in rl2) return rl2.response;

    const body = await req.json();
    let { merchantId, venueId, role, maxUses, expiresDays } = body;

    // 如果没有提供 merchantId，从当前 workspace 获取
    if (!merchantId) {
      const workspace = await getActiveWorkspace();
      if (!workspace || !workspace.merchantId) {
        return NextResponse.json(
          { error: 'INVALID_REQUEST', message: 'merchantId is required. Please select a workspace first.' },
          { status: 400 }
        );
      }
      merchantId = workspace.merchantId;
    }

    // 验证 merchantId 是有效的 UUID
    if (!isValidUuid(merchantId)) {
      return NextResponse.json(
        { 
          error: 'INVALID_MERCHANT_ID', 
          message: `Invalid merchant_id format: ${merchantId}. merchant_id must be a valid UUID.`,
          details: {
            merchantId,
            merchantIdType: typeof merchantId,
          },
        },
        { status: 400 }
      );
    }

    // 验证角色
    const validRoles = ['staff', 'manager', 'owner', 'admin'];
    const normalizedRole = role?.toLowerCase() || 'staff';
    if (!validRoles.includes(normalizedRole)) {
      return NextResponse.json(
        { error: 'INVALID_ROLE', message: `Role must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // 验证 maxUses
    const normalizedMaxUses = maxUses || 10;
    if (normalizedMaxUses < 1) {
      return NextResponse.json(
        { error: 'INVALID_MAX_USES', message: 'maxUses must be >= 1' },
        { status: 400 }
      );
    }

    // 调用 RPC 创建邀请码（使用 create_staff_invite）
    const { data, error } = await supabase.rpc('create_staff_invite', {
      p_merchant_id: merchantId,
      p_venue_id: venueId || null,
      p_intended_role: normalizedRole,
      p_max_uses: normalizedMaxUses,
      p_expires_days: expiresDays || 30,
      p_note: null,
    });

    if (error) {
      // 解析错误消息
      const errorMessage = error.message || 'Failed to create invite code';
      
      // 映射错误状态
      if (errorMessage.includes('UNAUTHORIZED')) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'User must be authenticated' },
          { status: 401 }
        );
      }
      
      if (errorMessage.includes('NOT_ALLOWED')) {
        return NextResponse.json(
          { error: 'NOT_ALLOWED', message: 'Only owner, manager, or admin can create invite codes' },
          { status: 403 }
        );
      }
      
      if (errorMessage.includes('MERCHANT_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'MERCHANT_NOT_FOUND', message: 'Merchant does not exist' },
          { status: 404 }
        );
      }
      
      if (errorMessage.includes('VENUE_MISMATCH')) {
        return NextResponse.json(
          { error: 'VENUE_MISMATCH', message: 'Venue does not belong to the merchant' },
          { status: 400 }
        );
      }
      
      if (errorMessage.includes('INVALID_ROLE')) {
        return NextResponse.json(
          { error: 'INVALID_ROLE', message: errorMessage },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: 'ERROR', message: errorMessage },
        { status: 500 }
      );
    }

    // 返回创建的邀请码信息
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Create invite error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message || 'Failed to create invite code' },
      { status: 500 }
    );
  }
}
