/**
 * GET /api/admin/settings
 * Admin Settings API（返回 regions 和 admin users）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // 获取所有地区
    const { data: regions, error: regionsError } = await supabase
      .from('regions')
      .select('*')
      .order('name');
    
    // 获取所有 Admin Users
    const { data: adminUsers, error: adminUsersError } = await supabase
      .from('admin_users')
      .select('user_id, is_active, created_at')
      .order('created_at', { ascending: false });
    
    // 获取用户 profiles（批量）
    const userIds = (adminUsers || []).map((au: any) => au.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);
    
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((profile: any) => {
      profileMap[profile.id] = profile;
    });
    
    if (regionsError || adminUsersError) {
      console.error('[ADMIN SETTINGS API] Error:', regionsError || adminUsersError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: (regionsError || adminUsersError)?.message },
        { status: 500 }
      );
    }
    
    // 获取最后一条 audit log 的时间
    const { data: lastAuditLog } = await supabase
      .from('audit_logs')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    return NextResponse.json({
      success: true,
      data: {
        regions: (regions || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          state: r.state,
          country: r.country,
          status: r.status || 'Operational',
          isActive: r.is_active,
          createdAt: r.created_at,
        })),
        adminUsers: (adminUsers || []).map((au: any) => {
          const profile = profileMap[au.user_id];
          return {
            id: au.user_id,
            displayName: profile?.display_name || 'Unknown',
            email: null, // profiles 表没有 email
            avatar: profile?.avatar_url || null,
            role: 'Full Access', // TODO: 从 admin_users 表获取实际角色
            isActive: au.is_active,
            createdAt: au.created_at,
          };
        }),
        settings: {
          force2FA: true, // TODO: 从配置表获取
          apiWriteAccess: false, // TODO: 从配置表获取
          systemStatus: 'active', // TODO: 从配置表获取
        },
        lastAudit: lastAuditLog?.created_at || null,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN SETTINGS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
