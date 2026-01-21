/**
 * POST /api/invites/create
 * 创建邀请码（仅 owner/manager/admin）
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    // 验证用户已登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'User must be authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { merchantId, venueId, role, maxUses, expiresDays } = body;

    // 验证必填字段
    if (!merchantId) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'merchantId is required' },
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
