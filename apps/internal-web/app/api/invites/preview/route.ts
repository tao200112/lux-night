/**
 * POST /api/invites/preview
 * 预览邀请码（不写库）
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

    // 调用 RPC 预览邀请码
    const { data, error } = await supabase.rpc('redeem_preview', {
      p_token: token.trim().toUpperCase(),
    });

    if (error) {
      // 解析错误消息
      const errorMessage = error.message || 'Failed to preview invite code';
      
      // 映射错误状态
      if (errorMessage.includes('not found') || errorMessage.includes('NOT_FOUND')) {
        return NextResponse.json(
          { valid: false, status: 'INVALID', message: 'Invite token not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { valid: false, status: 'ERROR', message: errorMessage },
        { status: 500 }
      );
    }

    // 返回预览结果
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Preview invite error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message || 'Failed to preview invite code' },
      { status: 500 }
    );
  }
}
