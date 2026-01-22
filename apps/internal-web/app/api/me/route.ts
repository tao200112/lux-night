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

    // 获取 merchant memberships（使用 admin client 绕过 RLS）
    let memberships: any[] = [];
    let membershipsError: any = null;
    
    if (adminClient) {
      const { data: membershipsData, error: membershipsErr } = await adminClient
        .from('merchant_members')
        .select('merchant_id, role, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('merchant_id', 'is', null); // 过滤 merchant_id 为 null 的记录
      
      memberships = membershipsData || [];
      membershipsError = membershipsErr;

      // DEBUG: 开发环境打印原始数据
      if (process.env.NODE_ENV === 'development') {
        console.log('[API /me] Raw memberships query:', {
          userId: user.id,
          membershipsCount: memberships?.length || 0,
          memberships: memberships,
          error: membershipsError ? {
            message: membershipsError.message,
            code: membershipsError.code,
            details: membershipsError.details,
            hint: membershipsError.hint,
          } : null,
        });
      }

      if (membershipsError) {
        console.error('[API /me] Memberships query error:', membershipsError);
      }

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

    // 获取完整的 workspaces 数据（包括 merchantName 和 venues）
    const workspaces: Array<{
      merchantId: string;
      merchantName: string;
      role: string;
      isActive: boolean;
      venues: Array<{
        venueId: string;
        venueName: string;
        isAssigned: boolean;
      }>;
    }> = [];

    if (adminClient && memberships && memberships.length > 0) {
      // 为每个 membership 获取 merchant 和 venues 信息
      for (const membership of memberships) {
        if (!membership.merchant_id) {
          console.warn('[API /me] Membership with null merchant_id:', membership);
          continue;
        }

        // 获取 merchant 信息
        const { data: merchant, error: merchantError } = await adminClient
          .from('merchants')
          .select('id, name')
          .eq('id', membership.merchant_id)
          .maybeSingle();

        if (merchantError) {
          console.error('[API /me] Merchant query error:', {
            merchant_id: membership.merchant_id,
            error: {
              message: merchantError.message,
              code: merchantError.code,
              details: merchantError.details,
            },
          });
        }

        if (!merchant) {
          console.warn('[API /me] Merchant not found:', membership.merchant_id);
          continue;
        }

        // 获取 venues 信息
        const { data: venues, error: venuesError } = await adminClient
          .from('venues')
          .select('id, name, merchant_id')
          .eq('merchant_id', membership.merchant_id);

        if (venuesError) {
          console.error('[API /me] Venues query error:', {
            merchant_id: membership.merchant_id,
            error: {
              message: venuesError.message,
              code: venuesError.code,
              details: venuesError.details,
            },
          });
        }

        workspaces.push({
          merchantId: membership.merchant_id,
          merchantName: merchant.name,
          role: membership.role,
          isActive: membership.is_active,
          venues: (venues || []).map((v: any) => ({
            venueId: v.id,
            venueName: v.name,
            isAssigned: true, // TODO: 根据实际业务逻辑判断
          })),
        });
      }
    }

    // DEBUG: 开发环境打印最终 workspaces 数据
    if (process.env.NODE_ENV === 'development') {
      console.log('[API /me] Final workspaces:', {
        count: workspaces.length,
        workspaces: workspaces,
        hasMemberships: memberships && memberships.length > 0,
        membershipsCount: memberships?.length || 0,
      });
    }

    return NextResponse.json({
      user,
      roles,
      memberships: workspaces, // 返回完整的 workspaces 数据
      hasMembership: memberships && memberships.length > 0, // 明确标识是否有 membership
      membershipError: membershipsError ? {
        message: membershipsError.message,
        code: membershipsError.code,
      } : null,
    });
  } catch (error: any) {
    console.error('[API /me] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
