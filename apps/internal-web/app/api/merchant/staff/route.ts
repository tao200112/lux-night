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
    
    // DEBUG: 开发环境打印 merchant_id 来源
    if (process.env.NODE_ENV === 'development') {
      console.log('[MERCHANT STAFF API] Workspace:', {
        merchantId: workspace?.merchantId || 'NULL',
        venueId: workspace?.venueId || 'NULL',
        role: workspace?.role || 'NULL',
      });
    }

    if (!workspace || !workspace.merchantId) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[MERCHANT STAFF API] No workspace or merchant_id missing');
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_WORKSPACE',
            message: 'No active workspace or merchant_id missing',
          },
        },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[MERCHANT STAFF API] Admin client creation failed - missing SUPABASE_SERVICE_ROLE_KEY');
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'Server configuration error',
          },
        },
        { status: 500 }
      );
    }

    // DEBUG: 开发环境打印 role 参数
    if (process.env.NODE_ENV === 'development') {
      console.log('[MERCHANT STAFF API] Role filter:', {
        roleParam: role || 'NULL',
        willFilter: role && role !== 'All' && role !== 'All Members',
      });
    }

    // 先尝试带 join 的查询（获取 profiles 信息）
    let query = adminClient
      .from('merchant_members')
      .select(`
        id,
        user_id,
        role,
        is_active,
        display_name,
        created_at,
        profiles:user_id (
          id,
          display_name,
          email,
          avatar_url
        )
      `)
      .eq('merchant_id', workspace.merchantId)
      .order('created_at', { ascending: false });

    // 根据 role 筛选
    if (role && role !== 'All' && role !== 'All Members') {
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

    let { data: members, error: membersError } = await query;

    // 如果 join 失败，降级为只查询 merchant_members（不带 profiles）
    if (membersError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[MERCHANT STAFF API] Join query failed:', {
          code: membersError.code,
          message: membersError.message,
          details: membersError.details,
          hint: membersError.hint,
        });
        console.log('[MERCHANT STAFF API] Falling back to merchant_members only query');
      }

      // 降级查询：只获取 merchant_members 基础字段
      let fallbackQuery = adminClient
        .from('merchant_members')
        .select('id, user_id, role, is_active, created_at')
        .eq('merchant_id', workspace.merchantId)
        .order('created_at', { ascending: false });

      // 应用 role 筛选
      if (role && role !== 'All' && role !== 'All Members') {
        const roleMap: Record<string, string> = {
          'Managers': 'MANAGER',
          'Staff': 'STAFF',
          'Security': 'SECURITY',
        };
        const dbRole = roleMap[role];
        if (dbRole) {
          fallbackQuery = fallbackQuery.eq('role', dbRole);
        }
      }

      const { data: fallbackMembers, error: fallbackError } = await fallbackQuery;

      if (fallbackError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[MERCHANT STAFF API] Fallback query also failed:', {
            code: fallbackError.code,
            message: fallbackError.message,
            details: fallbackError.details,
          });
        }
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FETCH_FAILED',
              message: `Failed to fetch staff members: ${fallbackError.message}`,
            },
          },
          { status: 500 }
        );
      }

      // 使用降级数据（没有 profiles 信息），添加空的 profiles 字段以保持类型一致
      members = (fallbackMembers || []).map((m: any) => ({
        ...m,
        profiles: null,
      })) as any;
    }

    // 格式化返回数据
    const staffList = (members || []).map((member: any) => {
      // merchant_members.display_name 覆盖 profiles.display_name
      const profile = member.profiles;
      const name = member.display_name || profile?.display_name || profile?.email?.split('@')[0] || `User ${member.user_id.slice(0, 8)}`;
      const email = profile?.email || 'N/A';
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

    // DEBUG: 开发环境打印最终返回 count
    if (process.env.NODE_ENV === 'development') {
      console.log('[MERCHANT STAFF API] Final result:', {
        count: staffList.length,
        merchantId: workspace.merchantId,
        roleFilter: role || 'All',
      });
    }

    return NextResponse.json({
      success: true,
      staff: staffList,
      count: staffList.length,
    });

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[MERCHANT STAFF API] Unexpected error:', {
        message: error.message,
        stack: error.stack,
      });
    }
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
