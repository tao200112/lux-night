/**
 * GET /api/me
 * 统一的身份判定 API
 * 返回当前用户的身份信息：user、roles、merchant_memberships 等
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { user: null, roles: null },
        { status: 200 }
      );
    }

    const adminClient = getAdminClient();
    const roles: {
      is_admin: boolean;
      merchant_memberships: Array<{
        merchant_id: string;
        role: string;
        is_active: boolean;
      }>;
      is_customer: boolean;
      primary_merchant_id: string | null;
    } = {
      is_admin: false,
      merchant_memberships: [],
      is_customer: true, // 默认所有登录用户都是 customer
      primary_merchant_id: null,
    };

    // 检查是否是 admin
    if (adminClient) {
      const { data: adminData } = await adminClient
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      
      roles.is_admin = !!adminData;
    }

    // 获取 merchant memberships
    if (adminClient) {
      const { data: memberships } = await adminClient
        .from('merchant_members')
        .select('merchant_id, role, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (memberships && memberships.length > 0) {
        roles.merchant_memberships = memberships.map(m => ({
          merchant_id: m.merchant_id,
          role: m.role,
          is_active: m.is_active,
        }));
        
        // 设置 primary_merchant_id（第一个 active membership）
        roles.primary_merchant_id = memberships[0].merchant_id;
      }
    }

    return NextResponse.json({
      user,
      roles,
    });
  } catch (error: any) {
    console.error('[API /me] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
