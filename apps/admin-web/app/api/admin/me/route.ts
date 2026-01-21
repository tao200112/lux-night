/**
 * Admin Me API
 * 检查当前用户是否为 admin（使用 service role 避免 RLS 问题）
 */

import { createServerSupabaseClient } from '@/lib/supabase/server-ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 1. 使用 SSR client 从 cookie 获取用户（使用 middleware 相同的逻辑）
    const { supabase } = createServerSupabaseClient(request);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }

    // 2. 使用 service role client 查询 admin 状态（绕过 RLS）
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('[ADMIN ME API] SUPABASE_SERVICE_ROLE_KEY not configured');
      return NextResponse.json(
        { success: false, code: 'CONFIG_ERROR', message: 'Service role key not configured' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

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
