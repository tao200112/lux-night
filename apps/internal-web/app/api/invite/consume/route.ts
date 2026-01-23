/**
 * POST /api/invite/consume
 * Internal Web - 邀请码兑换 API
 * 
 * 功能：
 * 1. 验证邀请码有效性（未禁用、未过期、未用尽）
 * 2. 创建 merchant_members 记录
 * 3. 更新邀请码使用计数和状态
 * 
 * 使用 Service Role Key 绕过 RLS
 * 
 * 数据库字段（invites 表）：
 * - token (text) - 邀请码
 * - merchant_id (uuid)
 * - venue_id (uuid)
 * - intended_role (text) - 'staff' | 'manager' | 'owner' | 'admin'
 * - issued_by_type (text) - 'admin' | 'merchant'
 * - max_uses (int), used_count (int)
 * - expires_at (timestamptz)
 * - disabled (bool), is_active (bool)
 * - redeemed_by (uuid), redeemed_at (timestamptz), revoked_at (timestamptz)
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

interface ConsumeInviteRequest {
  code: string;
}

interface ConsumeInviteResponse {
  success: boolean;
  error?: string;
  debugId?: string;
  details?: any;
  data?: {
    merchant_id: string;
    role: string;
    next: string;
  };
}

export async function POST(request: NextRequest) {
  // 生成 debugId 用于追踪本次请求
  const debugId = randomUUID().substring(0, 8);
  
  try {
    // ============================================================
    // 1. 检查用户登录状态
    // ============================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // 结构化日志：auth.getUser() 结果
    console.error('[INVITE CONSUME]', {
      debugId,
      step: 'auth.getUser',
      hasUser: !!user,
      userId: user?.id || null,
      userEmail: user?.email || null,
      authError: authError ? {
        message: authError.message,
        code: authError.status,
      } : null,
    });
    
    if (authError || !user) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Unauthorized. Please login first.',
          debugId,
          details: {
            authError: authError?.message || 'No user found',
          },
        },
        { status: 401 }
      );
    }

    // ============================================================
    // 2. 读取并验证请求体
    // ============================================================
    let body: ConsumeInviteRequest;
    try {
      body = await request.json();
    } catch (e) {
      console.error('[INVITE CONSUME]', {
        debugId,
        step: 'parse_request_body',
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Invalid request body',
          debugId,
          details: {
            parseError: e instanceof Error ? e.message : String(e),
          },
        },
        { status: 400 }
      );
    }

    const { code } = body;
    
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Invite code is required',
          debugId,
        },
        { status: 400 }
      );
    }

    const trimmedCode = code.trim();

    // ============================================================
    // 3. 使用 Service Role Key 查询邀请码（绕过 RLS）
    // ============================================================
    // 结构化日志：检查 service role key
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.error('[INVITE CONSUME]', {
      debugId,
      step: 'check_service_role_key',
      hasServiceRoleKey,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
    
    if (!hasServiceRoleKey) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Server configuration error',
          debugId,
          details: {
            missingEnv: 'SUPABASE_SERVICE_ROLE_KEY',
          },
        },
        { status: 500 }
      );
    }

    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 查询邀请码 - 包含 issued_by_type 字段
    const { data: invite, error: inviteError } = await serviceSupabase
      .from('invites')
      .select('id, token, merchant_id, venue_id, intended_role, issued_by_type, max_uses, used_count, expires_at, disabled, is_active, revoked_at')
      .eq('token', trimmedCode)
      .maybeSingle();

    // 结构化日志：查询 invite 的结果
    console.error('[INVITE CONSUME]', {
      debugId,
      step: 'query_invite',
      token: trimmedCode,
      found: !!invite,
      inviteId: invite?.id || null,
      merchantId: invite?.merchant_id || null,
      intendedRole: invite?.intended_role || null,
      issuedByType: invite?.issued_by_type || null,
      isActive: invite?.is_active ?? null,
      expiresAt: invite?.expires_at || null,
      usedCount: invite?.used_count ?? null,
      maxUses: invite?.max_uses ?? null,
      disabled: invite?.disabled ?? null,
      revokedAt: invite?.revoked_at || null,
      inviteError: inviteError ? {
        message: inviteError.message,
        code: inviteError.code,
        details: inviteError.details,
        hint: inviteError.hint,
      } : null,
    });

    if (inviteError) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Failed to verify invite code',
          debugId,
          details: {
            inviteError: {
              message: inviteError.message,
              code: inviteError.code,
            },
          },
        },
        { status: 500 }
      );
    }

    if (!invite) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Invalid invite code. Please check and try again.',
          debugId,
        },
        { status: 404 }
      );
    }

    // ============================================================
    // 4. 验证邀请码状态
    // ============================================================
    
    // 检查是否被禁用
    if (invite.disabled === true) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'This invite code has been disabled. Please contact your merchant owner.',
          debugId,
        },
        { status: 400 }
      );
    }

    // 检查是否非激活
    if (invite.is_active === false) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'This invite code is not active. Please contact your merchant owner.',
          debugId,
        },
        { status: 400 }
      );
    }

    // 检查是否已被撤销
    if (invite.revoked_at) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'This invite code has been revoked. Please contact your merchant owner.',
          debugId,
        },
        { status: 400 }
      );
    }

    // 检查是否过期
    if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at);
      const now = new Date();
      if (expiresAt < now) {
        return NextResponse.json<ConsumeInviteResponse>(
          {
            success: false,
            error: 'This invite code has expired. Please request a new one.',
            debugId,
          },
          { status: 400 }
        );
      }
    }

    // 检查使用次数是否已用尽
    if (invite.max_uses !== null && invite.max_uses !== undefined) {
      const currentUsedCount = invite.used_count || 0;
      if (currentUsedCount >= invite.max_uses) {
        return NextResponse.json<ConsumeInviteResponse>(
          {
            success: false,
            error: 'This invite code has reached its maximum usage limit.',
            debugId,
          },
          { status: 400 }
        );
      }
    }

    // ============================================================
    // 5. 解析角色（区分商家邀请码和员工邀请码）
    // ============================================================
    let roleToAssign: string;
    
    // 明确区分商家邀请码和员工邀请码
    if (invite.intended_role) {
      // intended_role 可能是 'owner', 'manager', 'staff', 'admin'
      // 如果是 'owner'，表示商家所有者邀请
      if (invite.intended_role.toLowerCase() === 'owner') {
        roleToAssign = 'owner';
      } else if (invite.intended_role.toLowerCase() === 'manager') {
        roleToAssign = 'manager';
      } else if (invite.intended_role.toLowerCase() === 'staff') {
        roleToAssign = 'staff';
      } else if (invite.intended_role.toLowerCase() === 'admin') {
        roleToAssign = 'admin';
      } else {
        // 未知的 intended_role，返回 400
        console.error('[INVITE CONSUME]', {
          debugId,
          step: 'parse_role',
          error: 'Unknown intended_role',
          intendedRole: invite.intended_role,
        });
        return NextResponse.json<ConsumeInviteResponse>(
          {
            success: false,
            error: 'Invalid invite code role configuration',
            debugId,
            details: {
              intendedRole: invite.intended_role,
            },
          },
          { status: 400 }
        );
      }
    } else {
      // intended_role 为空，根据 issued_by_type 判断
      if (invite.issued_by_type === 'admin') {
        // Admin 创建的邀请码，默认给 owner 角色
        roleToAssign = 'owner';
      } else {
        // Merchant 创建的邀请码，默认给 staff 角色
        roleToAssign = 'staff';
      }
    }

    // 结构化日志：角色解析结果
    console.error('[INVITE CONSUME]', {
      debugId,
      step: 'parse_role',
      intendedRole: invite.intended_role,
      issuedByType: invite.issued_by_type,
      roleToAssign,
    });

    // ============================================================
    // 6. 检查用户是否已经是该 merchant 的成员（幂等性检查）
    // ============================================================
    const { data: existingMembership, error: membershipCheckError } = await serviceSupabase
      .from('merchant_members')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .eq('merchant_id', invite.merchant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (membershipCheckError) {
      console.error('[INVITE CONSUME]', {
        debugId,
        step: 'check_existing_membership',
        error: {
          message: membershipCheckError.message,
          code: membershipCheckError.code,
          details: membershipCheckError.details,
        },
      });
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Failed to check existing membership',
          debugId,
          details: {
            membershipCheckError: {
              message: membershipCheckError.message,
              code: membershipCheckError.code,
            },
          },
        },
        { status: 500 }
      );
    }

    if (existingMembership) {
      // 幂等操作：如果已存在 membership，返回成功
      console.error('[INVITE CONSUME]', {
        debugId,
        step: 'idempotent_check',
        existingMembershipId: existingMembership.id,
        existingRole: existingMembership.role,
        isActive: existingMembership.is_active,
      });
      return NextResponse.json<ConsumeInviteResponse>({
        success: true,
        data: {
          merchant_id: invite.merchant_id,
          role: existingMembership.role,
          next: '/workspaces',
        },
        debugId,
      });
    }

    // ============================================================
    // 7. 创建 merchant_member 记录
    // ============================================================

    const { data: newMembership, error: memberError } = await serviceSupabase
      .from('merchant_members')
      .insert({
        merchant_id: invite.merchant_id,
        user_id: user.id,
        role: roleToAssign,
        is_active: true,
      })
      .select('id, merchant_id, role')
      .single();

    // 结构化日志：插入 merchant_members 的结果
    console.error('[INVITE CONSUME]', {
      debugId,
      step: 'insert_merchant_members',
      merchantId: invite.merchant_id,
      userId: user.id,
      roleToAssign,
      success: !!newMembership,
      newMembershipId: newMembership?.id || null,
      memberError: memberError ? {
        message: memberError.message,
        code: memberError.code,
        details: memberError.details,
        hint: memberError.hint,
      } : null,
    });

    if (memberError) {
      // 检查是否是唯一约束冲突（幂等性保护）
      if (memberError.code === '23505' || memberError.message?.includes('unique') || memberError.message?.includes('duplicate')) {
        // 唯一约束冲突：说明 membership 已存在，返回成功（幂等）
        console.error('[INVITE CONSUME]', {
          debugId,
          step: 'insert_merchant_members',
          conflict: 'unique_constraint',
          message: 'Membership already exists (unique constraint conflict)',
        });
        
        // 重新查询已存在的 membership
        const { data: existingMembershipAfterConflict } = await serviceSupabase
          .from('merchant_members')
          .select('id, role, is_active')
          .eq('user_id', user.id)
          .eq('merchant_id', invite.merchant_id)
          .eq('is_active', true)
          .maybeSingle();
        
        if (existingMembershipAfterConflict) {
          return NextResponse.json<ConsumeInviteResponse>({
            success: true,
            data: {
              merchant_id: invite.merchant_id,
              role: existingMembershipAfterConflict.role,
              next: '/workspaces',
            },
            debugId,
          });
        }
      }
      
      // 其他错误，返回 409 或 500
      const statusCode = memberError.code === '23505' ? 409 : 500;
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: statusCode === 409 
            ? 'Membership already exists. Please refresh the page.'
            : 'Failed to join merchant. Please try again.',
          debugId,
          details: {
            memberError: {
              message: memberError.message,
              code: memberError.code,
              details: memberError.details,
            },
          },
        },
        { status: statusCode }
      );
    }

    // ============================================================
    // 8. 更新邀请码使用状态
    // ============================================================
    const currentUsedCount = invite.used_count || 0;
    const newUsedCount = currentUsedCount + 1;
    const now = new Date().toISOString();

    // 构建更新对象
    const updateData: {
      used_count: number;
      redeemed_by: string;
      redeemed_at: string;
      is_active?: boolean;
      disabled?: boolean;
    } = {
      used_count: newUsedCount,
      redeemed_by: user.id,
      redeemed_at: now,
    };

    // 如果 max_uses 为 1 或递增后已用尽，禁用邀请码
    if (invite.max_uses !== null && invite.max_uses !== undefined) {
      if (invite.max_uses === 1 || newUsedCount >= invite.max_uses) {
        updateData.is_active = false;
        updateData.disabled = true;
      }
    }

    const { error: updateError } = await serviceSupabase
      .from('invites')
      .update(updateData)
      .eq('id', invite.id);

    // 结构化日志：更新 invites used_count 的结果
    console.error('[INVITE CONSUME]', {
      debugId,
      step: 'update_invite',
      inviteId: invite.id,
      oldUsedCount: currentUsedCount,
      newUsedCount,
      redeemedBy: user.id,
      redeemedAt: now,
      updateError: updateError ? {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
      } : null,
    });

    if (updateError) {
      // 不返回错误，membership 已创建成功，只记录日志
      console.error('[INVITE CONSUME]', {
        debugId,
        step: 'update_invite',
        warning: 'Failed to update invite, but membership was created successfully',
        updateError: {
          message: updateError.message,
          code: updateError.code,
        },
      });
    }

    // ============================================================
    // 9. 返回成功
    // ============================================================
    return NextResponse.json<ConsumeInviteResponse>({
      success: true,
      data: {
        merchant_id: invite.merchant_id,
        role: roleToAssign,
        next: '/workspaces',
      },
      debugId,
    });

  } catch (error: any) {
    // 顶层 catch：捕获所有未预期的异常
    console.error('[INVITE CONSUME]', {
      debugId,
      step: 'unexpected_error',
      error: {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        name: error?.name,
      },
    });
    
    return NextResponse.json<ConsumeInviteResponse>(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        debugId,
        details: {
          errorMessage: error?.message || 'Unknown error',
          errorName: error?.name,
        },
      },
      { status: 500 }
    );
  }
}
