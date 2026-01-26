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
import { setDefaultWorkspace } from '@/lib/internal/workspace';

/**
 * 验证 UUID 格式（v1 或 v4）
 * @param v 待验证的值
 * @returns 是否为有效的 UUID
 */
function isValidUuid(v: any): boolean {
  if (!v || typeof v !== 'string') {
    return false;
  }
  
  // 检查是否为字符串 "null"
  if (v === 'null' || v === 'NULL') {
    return false;
  }
  
  // UUID v1/v4 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v);
}

interface ConsumeInviteRequest {
  code: string;
}

interface ConsumeInviteResponse {
  success: boolean;
  error?: string;
  debugId?: string;
  step?: string;
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
  
  // 环境自检（只打印布尔值）
  const envCheck = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  console.log('[INVITE CONSUME]', {
    debugId,
    step: 'env.check',
    ...envCheck,
  });
  
  try {
    // ============================================================
    // 1. 检查用户登录状态
    // ============================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // 结构化日志：auth.getUser() 结果
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'auth.getUser',
      ok: !!user && !authError,
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
          step: 'auth.getUser',
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
      console.log('[INVITE CONSUME]', {
        debugId,
        step: 'invite.readBody',
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Invalid request body',
          debugId,
          step: 'invite.readBody',
          details: {
            parseError: e instanceof Error ? e.message : String(e),
          },
        },
        { status: 400 }
      );
    }

    const { code } = body;
    
    // 日志：打印 code 信息（不打印完整 code）
    const codeLength = code?.length || 0;
    const codePreview = code && code.length > 4 
      ? `${code.substring(0, 2)}...${code.substring(code.length - 2)}`
      : code || null;
    
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'invite.readBody',
      ok: !!(code && typeof code === 'string' && code.trim().length > 0),
      codeLength,
      codePreview,
      isEmpty: !code || code.trim().length === 0,
    });
    
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Invite code is required',
          debugId,
          step: 'invite.readBody',
        },
        { status: 400 }
      );
    }

    const trimmedCode = code.trim();

    // ============================================================
    // 3. 使用 Service Role Key 查询邀请码（绕过 RLS）
    // ============================================================
    if (!envCheck.hasServiceRoleKey) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Server configuration error',
          debugId,
          step: 'env.check',
          details: {
            missingEnv: 'SUPABASE_SERVICE_ROLE_KEY',
          },
        },
        { status: 500 }
      );
    }

    let serviceSupabase: any;
    let adminClientReady = false;
    try {
      const { createClient: createServiceClient } = await import('@supabase/supabase-js');
      serviceSupabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );
      adminClientReady = true;
    } catch (e) {
      console.log('[INVITE CONSUME]', {
        debugId,
        step: 'client.adminClientReady',
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Failed to initialize admin client',
          debugId,
          step: 'client.adminClientReady',
          details: {
            error: e instanceof Error ? e.message : String(e),
          },
        },
        { status: 500 }
      );
    }
    
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'client.adminClientReady',
      ok: adminClientReady,
      clientAdminClientReady: adminClientReady,
    });

    // 查询邀请码 - 包含 issued_by_type 和 region_id 字段
    const { data: invite, error: inviteError } = await serviceSupabase
      .from('invites')
      .select('id, token, merchant_id, venue_id, region_id, intended_role, issued_by_type, max_uses, used_count, expires_at, disabled, is_active, revoked_at')
      .eq('token', trimmedCode)
      .maybeSingle();

    // 结构化日志：查询 invite 的结果
    // 打印 merchant_id 的原始值（用于调试）
    const rawMerchantId = invite?.merchant_id;
    const merchantIdType = typeof rawMerchantId;
    const merchantIdValue = rawMerchantId === null ? 'null' : rawMerchantId === undefined ? 'undefined' : String(rawMerchantId);
    
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'invite.lookup',
      ok: !!invite && !inviteError,
      queryField: 'token',
      queryValue: trimmedCode.substring(0, 2) + '...' + trimmedCode.substring(trimmedCode.length - 2),
      found: !!invite,
      inviteId: invite?.id || null,
      merchantId: rawMerchantId,
      merchantIdRaw: merchantIdValue,
      merchantIdType,
      merchantIdIsValid: rawMerchantId ? isValidUuid(rawMerchantId) : false,
      intendedRole: invite?.intended_role || null,
      issuedByType: invite?.issued_by_type || null,
      isActive: invite?.is_active ?? null,
      disabled: invite?.disabled ?? null,
      expiresAt: invite?.expires_at || null,
      usedCount: invite?.used_count ?? null,
      maxUses: invite?.max_uses ?? null,
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
          step: 'invite.lookup',
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
          step: 'invite.lookup',
        },
        { status: 404 }
      );
    }

    // ============================================================
    // 4. 处理 merchant_id：如果为空且有 region_id，创建新 Merchant
    // ============================================================
    let finalMerchantId = invite.merchant_id;
    let createdNewMerchant = false;
    
    if (!finalMerchantId || !isValidUuid(finalMerchantId)) {
      // 如果是 Admin 创建的 invite 且有 region_id，创建新 Merchant
      if (invite.issued_by_type === 'admin' && invite.region_id && isValidUuid(invite.region_id)) {
        console.log('[INVITE CONSUME]', {
          debugId,
          step: 'merchant.create',
          ok: false, // 将在创建后更新
          regionId: invite.region_id,
          userId: user.id,
          userEmail: user.email,
        });
        
        // 生成商家名称（使用用户 email 前缀或默认名称）
        const merchantName = user.email 
          ? `${user.email.split('@')[0]}'s Business`
          : `New Business ${new Date().toISOString().slice(0, 10)}`;
        
        // 创建新 Merchant
        const { data: newMerchant, error: createMerchantError } = await serviceSupabase
          .from('merchants')
          .insert({
            name: merchantName,
            region_id: invite.region_id,
            status: 'active',
          })
          .select('id, name, region_id')
          .single();
        
        if (createMerchantError || !newMerchant) {
          console.log('[INVITE CONSUME]', {
            debugId,
            step: 'merchant.create',
            ok: false,
            error: createMerchantError?.message || 'Failed to create merchant',
          });
          return NextResponse.json<ConsumeInviteResponse>(
            {
              success: false,
              error: 'Failed to create merchant. Please try again.',
              debugId,
              step: 'merchant.create',
              details: {
                error: createMerchantError?.message,
              },
            },
            { status: 500 }
          );
        }
        
        finalMerchantId = newMerchant.id;
        createdNewMerchant = true;
        
        console.log('[INVITE CONSUME]', {
          debugId,
          step: 'merchant.create',
          ok: true,
          newMerchantId: finalMerchantId,
          newMerchantName: newMerchant.name,
        });
        
        // 更新 invite 的 merchant_id（可选，方便追踪）
        await serviceSupabase
          .from('invites')
          .update({ merchant_id: finalMerchantId })
          .eq('id', invite.id);
          
      } else {
        // 既没有 merchant_id 也没有 region_id，无法继续
        console.log('[INVITE CONSUME]', {
          debugId,
          step: 'invite.invalid_merchant_id',
          ok: false,
          merchantId: invite.merchant_id,
          regionId: invite.region_id,
          issuedByType: invite.issued_by_type,
          inviteId: invite.id,
        });
        
        return NextResponse.json<ConsumeInviteResponse>(
          {
            success: false,
            error: 'Invite is missing required information. Please contact the administrator.',
            debugId,
            step: 'invite.invalid_merchant_id',
            details: {
              merchantId: invite.merchant_id,
              regionId: invite.region_id,
              inviteId: invite.id,
            },
          },
          { status: 400 }
        );
      }
    }

    // ============================================================
    // 5. 验证邀请码状态
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
    // 6. 解析角色（区分商家邀请码和员工邀请码）
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
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'parse_role',
      ok: !!roleToAssign,
      intendedRole: invite.intended_role,
      issuedByType: invite.issued_by_type,
      roleToAssign,
    });

    // ============================================================
    // 7. 检查用户是否已经是该 merchant 的成员（幂等性检查）
    // ============================================================
    const { data: existingMembership, error: membershipCheckError } = await serviceSupabase
      .from('merchant_members')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .eq('merchant_id', finalMerchantId)
      .eq('is_active', true)
      .maybeSingle();
    
    // 单独查询 count
    const { count: membershipCount } = await serviceSupabase
      .from('merchant_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('merchant_id', finalMerchantId)
      .eq('is_active', true);
    
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'membership.checkExisting',
      ok: !membershipCheckError,
      count: membershipCount ?? (existingMembership ? 1 : 0),
      queryConditions: {
        user_id: user.id,
        merchant_id: finalMerchantId,
        is_active: true,
      },
      found: !!existingMembership,
      existingMembershipId: existingMembership?.id || null,
      existingRole: existingMembership?.role || null,
      createdNewMerchant, // 标记是否刚创建了新 merchant
      membershipCheckError: membershipCheckError ? {
        message: membershipCheckError.message,
        code: membershipCheckError.code,
        details: membershipCheckError.details,
      } : null,
    });

    if (membershipCheckError) {
      return NextResponse.json<ConsumeInviteResponse>(
        {
          success: false,
          error: 'Failed to check existing membership',
          debugId,
          step: 'membership.checkExisting',
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
      // 幂等操作：如果已存在 membership，设置 workspace 并返回成功
      console.log('[INVITE CONSUME]', {
        debugId,
        step: 'membership.checkExisting',
        ok: true,
        idempotent: true,
        existingMembershipId: existingMembership.id,
        existingRole: existingMembership.role,
        isActive: existingMembership.is_active,
      });
      
      // 设置 workspace 为当前 merchant（即使已存在 membership，也要确保 workspace 正确）
      try {
        await setDefaultWorkspace(finalMerchantId);
        console.log('[INVITE CONSUME]', {
          debugId,
          step: 'workspace.setDefault',
          ok: true,
          merchantId: finalMerchantId,
        });
      } catch (workspaceError: any) {
        // 如果设置 workspace 失败，记录日志但不阻止返回成功
        console.log('[INVITE CONSUME]', {
          debugId,
          step: 'workspace.setDefault',
          ok: false,
          warning: 'Failed to set default workspace, but membership exists',
          error: workspaceError?.message || 'Unknown error',
        });
      }
      
      return NextResponse.json<ConsumeInviteResponse>({
        success: true,
        data: {
          merchant_id: finalMerchantId,
          role: existingMembership.role,
          next: '/dashboard',
        },
        debugId,
      });
    }

    // ============================================================
    // 8. 创建 merchant_member 记录
    // ============================================================
    const insertPayload = {
      merchant_id: finalMerchantId,
      user_id: user.id,
      role: roleToAssign,
      is_active: true,
    };
    
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'membership.insert',
      ok: false, // 将在插入后更新
      payload: {
        merchant_id: insertPayload.merchant_id,
        user_id: insertPayload.user_id,
        role: insertPayload.role,
        is_active: insertPayload.is_active,
      },
    });

    const { data: newMembership, error: memberError } = await serviceSupabase
      .from('merchant_members')
      .insert(insertPayload)
      .select('id, merchant_id, role')
      .single();

    // 结构化日志：插入 merchant_members 的结果
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'membership.insert',
      ok: !!newMembership && !memberError,
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
        console.log('[INVITE CONSUME]', {
          debugId,
          step: 'membership.insert',
          ok: false,
          conflict: 'unique_constraint',
          errorCode: memberError.code,
          message: 'Membership already exists (unique constraint conflict)',
        });
        
        // 重新查询已存在的 membership
        const { data: existingMembershipAfterConflict } = await serviceSupabase
          .from('merchant_members')
          .select('id, role, is_active')
          .eq('user_id', user.id)
          .eq('merchant_id', finalMerchantId)
          .eq('is_active', true)
          .maybeSingle();
        
        if (existingMembershipAfterConflict) {
          return NextResponse.json<ConsumeInviteResponse>({
            success: true,
            data: {
              merchant_id: finalMerchantId,
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
    // 9. 更新邀请码使用状态
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
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'invite.updateUsed',
      ok: !updateError,
      inviteId: invite.id,
      payload: {
        used_count: newUsedCount,
        redeemed_by: user.id,
        redeemed_at: now,
        disabled: updateData.disabled ?? null,
        is_active: updateData.is_active ?? null,
      },
      updateError: updateError ? {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
      } : null,
    });

    if (updateError) {
      // 不返回错误，membership 已创建成功，只记录日志
      console.log('[INVITE CONSUME]', {
        debugId,
        step: 'invite.updateUsed',
        ok: false,
        warning: 'Failed to update invite, but membership was created successfully',
        updateError: {
          message: updateError.message,
          code: updateError.code,
        },
      });
    }

    // ============================================================
    // 10. 设置默认 workspace（原子操作：membership + workspace）
    // ============================================================
    try {
      await setDefaultWorkspace(finalMerchantId);
      console.log('[INVITE CONSUME]', {
        debugId,
        step: 'workspace.setDefault',
        ok: true,
        merchantId: finalMerchantId,
      });
    } catch (workspaceError: any) {
      // 如果设置 workspace 失败，记录日志但不阻止返回成功（membership 已创建）
      console.log('[INVITE CONSUME]', {
        debugId,
        step: 'workspace.setDefault',
        ok: false,
        warning: 'Failed to set default workspace, but membership was created',
        error: workspaceError?.message || 'Unknown error',
      });
    }

    // ============================================================
    // 11. 返回成功
    // ============================================================
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'response.ok',
      ok: true,
      next: '/dashboard',
      role: roleToAssign,
      merchantId: finalMerchantId,
      createdNewMerchant,
    });
    
    return NextResponse.json<ConsumeInviteResponse>({
      success: true,
      data: {
        merchant_id: finalMerchantId,
        role: roleToAssign,
        next: '/dashboard',
      },
      debugId,
    });

  } catch (error: any) {
    // 顶层 catch：捕获所有未预期的异常
    const errorStack = error?.stack ? error.stack.substring(0, 500) : null;
    
    console.log('[INVITE CONSUME]', {
      debugId,
      step: 'catch.unhandled',
      ok: false,
      error: {
        name: error?.name || 'Unknown',
        message: error?.message || 'Unknown error',
        stack: errorStack,
      },
    });
    
    return NextResponse.json<ConsumeInviteResponse>(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        debugId,
        step: 'catch.unhandled',
        details: {
          errorMessage: error?.message || 'Unknown error',
          errorName: error?.name,
        },
      },
      { status: 500 }
    );
  }
}
