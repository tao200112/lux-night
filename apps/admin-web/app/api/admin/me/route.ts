/**
 * Admin Me API
 * 检查当前用户是否为 admin（使用 service role 避免 RLS 问题）
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 1. 使用标准 server client 获取用户
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }

    // 2. 使用 admin client 查询 admin 状态（绕过 RLS）
    const supabaseAdmin = createAdminClient();

    // 3. 查询 profiles.is_admin 和 admin_users 表
    const [profileResult, adminUsersResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single(),
      supabaseAdmin
        .from('admin_users')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single(),
    ]);

    // 4. 判断是否为 admin
    const isAdmin =
      profileResult.data?.is_admin === true ||
      adminUsersResult.data?.is_active === true;

    if (process.env.NODE_ENV === 'development') {
      console.log('[ADMIN ME API] User check:', {
        userId: user.id,
        email: user.email,
        isAdmin,
        profilesIsAdmin: profileResult.data?.is_admin,
        adminUsersActive: adminUsersResult.data?.is_active,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        isAdmin,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN ME API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
