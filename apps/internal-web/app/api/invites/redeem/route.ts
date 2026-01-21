/**
 * POST /api/invites/redeem
 * 兑换邀请码（写库）
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
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'token is required' },
        { status: 400 }
      );
    }

    // 调用 RPC 兑换邀请码
    const { data, error } = await supabase.rpc('redeem_invite', {
      p_token: token.trim().toUpperCase(),
    });

    if (error) {
      // 解析错误消息
      const errorMessage = error.message || 'Failed to redeem invite code';
      
      // 映射错误状态
      if (errorMessage.includes('UNAUTHORIZED')) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'User must be authenticated' },
          { status: 401 }
        );
      }
      
      if (errorMessage.includes('not found') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('INVALID')) {
        return NextResponse.json(
          { error: 'INVALID', message: 'Invite token not found' },
          { status: 404 }
        );
      }
      
      if (errorMessage.includes('DISABLED')) {
        return NextResponse.json(
          { error: 'DISABLED', message: 'Invite token is disabled' },
          { status: 400 }
        );
      }
      
      if (errorMessage.includes('EXPIRED')) {
        return NextResponse.json(
          { error: 'EXPIRED', message: 'Invite token has expired' },
          { status: 400 }
        );
      }
      
      if (errorMessage.includes('USED_UP')) {
        return NextResponse.json(
          { error: 'USED_UP', message: 'Invite token has reached max uses' },
          { status: 400 }
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
      
      return NextResponse.json(
        { error: 'ERROR', message: errorMessage },
        { status: 500 }
      );
    }

    // 返回兑换结果
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Redeem invite error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message || 'Failed to redeem invite code' },
      { status: 500 }
    );
  }
}
