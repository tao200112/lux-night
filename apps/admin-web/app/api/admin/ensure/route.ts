/**
 * POST /api/admin/ensure
 * 确保当前用户是管理员（创建 admin_users 记录或设置 profiles.is_admin）
 * 使用 service role 绕过 RLS
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

// 使用 service role key 创建 admin client（绕过 RLS）
const getAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};

export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;

    // 首先验证用户已登录（使用普通 client）
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      );
    }

    // 检查是否已经是 admin
    const [profileResult, adminUsersResult] = await Promise.all([
      adminClient
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle(),
      adminClient
        .from('admin_users')
        .select('id, is_active')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const isAdminFromProfile = profileResult.data?.is_admin === true;
    const isAdminFromTable = adminUsersResult.data?.is_active === true;

    if (isAdminFromProfile || isAdminFromTable) {
      return NextResponse.json({
        success: true,
        message: 'User is already an admin',
        isAdmin: true,
      });
    }

    // 创建 admin_users 记录
    const { data: newAdminUser, error: insertError } = await adminClient
      .from('admin_users')
      .insert({
        user_id: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[API /admin/ensure] Error creating admin_users record:', insertError);
      
      // 如果插入失败，尝试更新 profiles.is_admin
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', user.id);

      if (updateError) {
        console.error('[API /admin/ensure] Error updating profiles.is_admin:', updateError);
        return NextResponse.json(
          { error: 'Failed to ensure admin status', details: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Admin status set via profiles.is_admin',
        isAdmin: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Admin user created successfully',
      isAdmin: true,
      adminUser: newAdminUser,
    });
  } catch (error: any) {
    console.error('[API /admin/ensure] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
