/**
 * POST /api/workspace/select
 * 选择并设置默认 workspace
 * 
 * 功能：
 * 1. 验证用户登录状态
 * 2. 验证用户对该 merchant 有 membership
 * 3. 验证 venue（如果指定）
 * 4. 更新 profile 的 default_merchant_id 和 default_venue_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { setDefaultWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export const runtime = 'nodejs'; // 确保使用 Node.js runtime，避免 Edge runtime 限制

export async function POST(request: NextRequest) {
  try {
    const rl = await rateLimitOrResponse(request, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please login first.' },
        { status: 401 }
      );
    }

    // 读取请求体
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // 支持两种参数格式：merchantId/merchant_id, venueId/venue_id
    const merchantId = body.merchantId || body.merchant_id;
    const venueId = body.venueId || body.venue_id;

    if (!merchantId || typeof merchantId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'merchantId is required' },
        { status: 400 }
      );
    }

    // 验证用户对该 merchant 有 membership
    const { data: membership, error: membershipError } = await supabase
      .from('merchant_members')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .maybeSingle();

    if (membershipError) {
      console.error('[API /workspace/select] Membership check error:', membershipError);
      return NextResponse.json(
        { success: false, error: 'Failed to verify membership' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'No access to this merchant' },
        { status: 403 }
      );
    }

    // 验证 venue（如果指定）
    if (venueId) {
      const { data: venue, error: venueError } = await supabase
        .from('venues')
        .select('id, merchant_id')
        .eq('id', venueId)
        .eq('merchant_id', merchantId)
        .maybeSingle();

      if (venueError) {
        console.error('[API /workspace/select] Venue check error:', venueError);
        return NextResponse.json(
          { success: false, error: 'Failed to verify venue' },
          { status: 500 }
        );
      }

      if (!venue) {
        return NextResponse.json(
          { success: false, error: 'Invalid venue or venue does not belong to this merchant' },
          { status: 400 }
        );
      }
    }

    // 设置默认 workspace（更新 profile）
    try {
      await setDefaultWorkspace(merchantId, venueId);
    } catch (error: any) {
      console.error('[API /workspace/select] Set default workspace error:', error);
      
      if (error.message === 'UNAUTHENTICATED') {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
      
      if (error.message === 'NO_ACCESS') {
        return NextResponse.json(
          { success: false, error: 'No access to this merchant' },
          { status: 403 }
        );
      }
      
      if (error.message === 'INVALID_VENUE') {
        return NextResponse.json(
          { success: false, error: 'Invalid venue' },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to set default workspace' },
        { status: 500 }
      );
    }

    // DEBUG: 开发环境打印成功日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[API /workspace/select] Success:', {
        userId: user.id,
        merchantId,
        venueId,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        merchantId,
        venueId: venueId || null,
      },
    });

  } catch (error: any) {
    console.error('[API /workspace/select] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
