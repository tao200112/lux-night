/**
 * GET /api/debug/event-change-requests
 * 临时调试 endpoint，用于诊断 change requests 相关问题
 * 仅在开发环境或需要 ADMIN_KEY 时可用
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// 检查是否允许访问调试 endpoint
function isDebugAllowed(): boolean {
  // 开发环境或设置了 ADMIN_KEY
  return process.env.NODE_ENV === 'development' || !!process.env.ADMIN_DEBUG_KEY;
}

// 使用 service role key 创建 admin client
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
    if (!isDebugAllowed()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Debug endpoint not available in production',
          },
        },
        { status: 403 }
      );
    }

    await requireInternalAuth();
    
    const searchParams = req.nextUrl.searchParams;
    const eventId = searchParams.get('event_id');

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Must be logged in',
        },
        debug: {
          userError: userError ? {
            code: userError.code,
            message: userError.message,
          } : null,
        },
      }, { status: 401 });
    }

    // 获取 workspace
    const workspace = await getActiveWorkspace();
    const merchantIdDebug = {
      userId: user.id,
      source: 'getActiveWorkspace() -> profiles.default_merchant_id',
      workspace: workspace ? {
        merchantId: workspace.merchantId,
        venueId: workspace.venueId,
        merchantName: workspace.merchantName,
      } : null,
      hasWorkspace: !!workspace,
    };

    // 测试 event 是否属于 merchant
    let eventCheck: any = null;
    if (eventId && workspace?.merchantId) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, merchant_id, title')
        .eq('id', eventId)
        .eq('merchant_id', workspace.merchantId)
        .single();

      eventCheck = {
        eventId,
        found: !!event,
        belongsToMerchant: !!event && event.merchant_id === workspace.merchantId,
        event: event ? {
          id: event.id,
          title: event.title,
          merchant_id: event.merchant_id,
        } : null,
        error: eventError ? {
          code: eventError.code,
          message: eventError.message,
          details: eventError.details,
        } : null,
      };
    }

    // 测试 SELECT 权限（dry-run）
    const { data: selectTest, error: selectError } = await supabase
      .from('event_change_requests')
      .select('id')
      .limit(1);

    const selectPermission = {
      allowed: !selectError,
      error: selectError ? {
        code: selectError.code,
        message: selectError.message,
        details: selectError.details,
        hint: selectError.hint,
        isRLS: selectError.code === '42501' || selectError.message?.includes('permission denied') || selectError.message?.includes('RLS'),
      } : null,
    };

    // 测试 INSERT 权限（dry-run，不实际插入）
    const insertPermission = {
      note: 'INSERT permission cannot be tested without actually inserting. Check RLS policies.',
    };

    // 使用 admin client 测试（如果可用）
    const adminClient = getAdminClient();
    let adminTest: any = null;
    if (adminClient) {
      const { data: adminSelect, error: adminError } = await adminClient
        .from('event_change_requests')
        .select('id')
        .limit(1);

      adminTest = {
        available: true,
        selectAllowed: !adminError,
        error: adminError ? {
          code: adminError.code,
          message: adminError.message,
          details: adminError.details,
        } : null,
      };
    } else {
      adminTest = {
        available: false,
        reason: 'SUPABASE_SERVICE_ROLE_KEY not configured',
      };
    }

    // 健康检查：表是否存在
    const { data: healthCheck, error: healthError } = await supabase
      .from('event_change_requests')
      .select('id')
      .limit(1);

    const tableHealth = {
      exists: !healthError || healthError.code !== '42P01',
      error: healthError ? {
        code: healthError.code,
        message: healthError.message,
        details: healthError.details,
        hint: healthError.hint,
        isTableNotFound: healthError.code === '42P01' || healthError.message?.includes('does not exist'),
      } : null,
      tableName: 'event_change_requests',
      schema: 'public',
    };

    return NextResponse.json({
      success: true,
      debug: {
        user: {
          id: user.id,
          email: user.email,
        },
        merchantId: merchantIdDebug,
        eventCheck,
        permissions: {
          select: selectPermission,
          insert: insertPermission,
        },
        adminClient: adminTest,
        tableHealth,
      },
    });

  } catch (error: any) {
    console.error('[DEBUG] Unexpected error:', error);
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
