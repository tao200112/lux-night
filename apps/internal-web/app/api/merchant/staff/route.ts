/**
 * GET /api/merchant/staff
 * 获取当前 merchant 的员工列表（merchant_members）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

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

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    
    const searchParams = req.nextUrl.searchParams;
    const role = searchParams.get('role'); // All | Managers | Staff | Security

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { error: 'SERVER_ERROR', message: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 获取 merchant_members
    let query = adminClient
      .from('merchant_members')
      .select(`
        id,
        user_id,
        role,
        is_active,
        created_at,
        profiles:user_id (
          id,
          full_name,
          email,
          avatar_url
        )
      `)
      .eq('merchant_id', workspace.merchantId)
      .order('created_at', { ascending: false });

    // 根据 role 筛选
    if (role && role !== 'All Members') {
      // 映射角色名称
      const roleMap: Record<string, string> = {
        'Managers': 'MANAGER',
        'Staff': 'STAFF',
        'Security': 'SECURITY',
      };
      const dbRole = roleMap[role];
      if (dbRole) {
        query = query.eq('role', dbRole);
      }
    }

    const { data: members, error: membersError } = await query;

    if (membersError) {
      console.error('[MERCHANT STAFF] Query error:', membersError);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: 'Failed to fetch staff members' },
        { status: 500 }
      );
    }

    // 格式化返回数据
    const staffList = (members || []).map((member: any) => {
      const profile = member.profiles;
      const name = profile?.full_name || profile?.email?.split('@')[0] || 'Unknown';
      const email = profile?.email || 'Unknown';
      const avatar = profile?.avatar_url || null;

      // 生成首字母头像
      const initials = name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      return {
        id: member.id,
        user_id: member.user_id,
        name,
        email,
        role: member.role,
        is_active: member.is_active,
        created_at: member.created_at,
        avatar_url: avatar,
        initials,
        // Last active 暂时没有真实数据，返回 null
        last_active: null,
      };
    });

    return NextResponse.json({
      staff: staffList,
      count: staffList.length,
    });

  } catch (error: any) {
    console.error('[MERCHANT STAFF] Unexpected error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
