/**
 * POST /api/merchant/event-change-requests
 * GET /api/merchant/event-change-requests
 * 商家提交和获取活动修改请求
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

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

// Zod 校验 Schema - 支持新旧格式
const PostRequestSchema = z.object({
  event_id: z.string().uuid('event_id must be a valid UUID'),
  request_type: z.enum([
    'price_change', 'inventory_change', 'event_edit', 'poster_change', // 新格式
    'price', 'inventory', 'poster' // 旧格式兼容
  ], {
    errorMap: () => ({ 
      message: 'request_type must be one of: price_change, inventory_change, event_edit, poster_change, price, inventory, poster' 
    })
  }),
  payload: z.object({}).passthrough().optional(),
  payload_json: z.object({}).passthrough().optional(),
}).refine(
  (data) => data.payload || data.payload_json,
  {
    message: 'Either payload or payload_json is required',
    path: ['payload'],
  }
);

// 标准化 request_type
function normalizeRequestType(requestType: string): string {
  const mapping: Record<string, string> = {
    'price_change': 'price',
    'inventory_change': 'inventory',
    'poster_change': 'poster',
    'event_edit': 'general',
    'price': 'price',
    'inventory': 'inventory',
    'poster': 'poster',
  };
  return mapping[requestType] || requestType;
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalAuth();
    
    // 读取 body
    const body = await req.json();
    console.log('[event-change-requests][POST] body=', body);

    // 兼容旧前端字段：如果 payload_json 存在而 payload 不存在，则 payload = payload_json
    const normalizedBody = {
      ...body,
      payload: body.payload || body.payload_json,
    };

    // 构造 parsedBody（用于调试，移除敏感信息）
    const parsedBody = {
      event_id: normalizedBody.event_id,
      request_type: normalizedBody.request_type,
      payload_keys: normalizedBody.payload ? Object.keys(normalizedBody.payload) : null,
      payload_json_keys: normalizedBody.payload_json ? Object.keys(normalizedBody.payload_json) : null,
    };

    // Zod 校验
    const validationResult = PostRequestSchema.safeParse(normalizedBody);

    if (!validationResult.success) {
      const issues = validationResult.error.issues;
      console.error('[event-change-requests][POST] Validation failed:', issues);
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: issues,
          },
          debug: {
            receivedKeys: Object.keys(body),
            parsedBody,
          },
        },
        { status: 400 }
      );
    }

    const { event_id, request_type, payload } = validationResult.data;

    // 标准化 request_type
    const normalizedRequestType = normalizeRequestType(request_type);

    // 获取用户信息
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Must be logged in',
          },
          debug: {
            receivedKeys: Object.keys(body),
            parsedBody,
            userError: userError ? {
              code: userError.code,
              message: userError.message,
            } : null,
          },
        },
        { status: 401 }
      );
    }

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    
    // 构造 merchant_id 推导信息
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

    console.log('[event-change-requests][POST] Merchant ID derivation:', merchantIdDebug);
    
    if (!workspace || !workspace.merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_MERCHANT',
            message: 'No selected merchant/workspace',
          },
          debug: {
            receivedKeys: Object.keys(body),
            parsedBody,
            merchantId: merchantIdDebug,
          },
        },
        { status: 400 }
      );
    }

    // 验证 event 属于当前 merchant (events_v2)
    const { data: event, error: eventError } = await supabase
      .from('events_v2')
      .select('id, merchant_id')
      .eq('id', event_id)
      .eq('merchant_id', workspace.merchantId)
      .single();

    if (eventError || !event) {
      console.error('[event-change-requests][POST] Event validation error:', {
        eventError: eventError ? {
          code: eventError.code,
          message: eventError.message,
          details: eventError.details,
          hint: eventError.hint,
        } : null,
        event_id,
        merchant_id: workspace.merchantId,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Event does not belong to current merchant',
          },
          debug: {
            receivedKeys: Object.keys(body),
            parsedBody,
            merchantId: merchantIdDebug,
            eventError: eventError ? {
              code: eventError.code,
              message: eventError.message,
              details: eventError.details,
            } : null,
          },
        },
        { status: 403 }
      );
    }

    // 构造 insertData (merchant_change_requests 表)
    const insertData = {
      event_id,
      merchant_id: workspace.merchantId,
      target_week_start_date: null, // nullable for price/inventory/poster requests
      payload: payload as object,
      request_type: normalizedRequestType,
      submitted_by: user.id,
      status: 'pending' as const,
    };

    console.log('[event-change-requests][POST] insertData=', insertData);

    // 使用 merchant_change_requests 表
    let { data: request, error: createError } = await supabase
      .from('merchant_change_requests')
      .insert(insertData)
      .select('id, request_type, status, payload, created_at, reviewed_at, review_note')
      .single();

    let usedServiceRole = false;

    // 如果是 RLS/permission denied 错误，使用 service role client
    if (createError && (createError.code === '42501' || createError.message?.includes('permission denied') || createError.message?.includes('RLS'))) {
      console.error('[event-change-requests][POST] RLS/permission denied, retrying with admin client:', {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
      });

      const adminClient = getAdminClient();
      if (!adminClient) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'SERVER_CONFIG_ERROR',
              message: 'Service role key not configured',
            },
            debug: {
              receivedKeys: Object.keys(body),
              parsedBody,
              merchantId: merchantIdDebug,
            },
          },
          { status: 500 }
        );
      }

      usedServiceRole = true;
      const { data: adminRequest, error: adminError } = await adminClient
        .from('merchant_change_requests')
        .insert(insertData)
        .select('id, request_type, status, payload, created_at, reviewed_at, review_note')
        .single();

      if (adminError) {
        console.error('[event-change-requests][POST] Admin client insert error:', {
          code: adminError.code,
          message: adminError.message,
          details: adminError.details,
          hint: adminError.hint,
        });
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'CREATE_FAILED',
              message: adminError.message || 'Failed to create change request',
              details: adminError.details,
              hint: adminError.hint,
            },
            debug: {
              receivedKeys: Object.keys(body),
              parsedBody,
              merchantId: merchantIdDebug,
              usedServiceRole: true,
            },
          },
          { status: 500 }
        );
      }

      request = adminRequest;
    } else if (createError) {
      // 其他 Supabase 错误
      console.error('[event-change-requests][POST] Supabase insert error:', {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CREATE_FAILED',
            message: createError.message || 'Failed to create change request',
            details: createError.details,
            hint: createError.hint,
          },
          debug: {
            receivedKeys: Object.keys(body),
            parsedBody,
            merchantId: merchantIdDebug,
            usedServiceRole: false,
          },
        },
        { status: 500 }
      );
    }

    if (!request) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CREATE_FAILED',
            message: 'Request created but no data returned',
          },
          debug: {
            receivedKeys: Object.keys(body),
            parsedBody,
            merchantId: merchantIdDebug,
            usedServiceRole,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request: {
        id: request.id,
        request_type: request.request_type,
        status: request.status,
        payload_json: (request as any).payload,
        submitted_at: (request as any).created_at,
        approved_at: (request as any).reviewed_at,
        rejected_reason: (request as any).review_note,
      },
      debug: {
        usedServiceRole,
      },
    }, { status: 201 });

  } catch (error: any) {
    console.error('[event-change-requests][POST] Unexpected error:', error);
    
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

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    
    const searchParams = req.nextUrl.searchParams;
    const eventId = searchParams.get('event_id');
    const status = searchParams.get('status');

    console.log('[event-change-requests][GET] Query params:', {
      event_id: eventId || 'NULL',
      status: status || 'NULL',
    });

    // 获取用户信息
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
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
        },
        { status: 401 }
      );
    }

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    
    // 构造 merchant_id 推导信息
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

    console.log('[event-change-requests][GET] Merchant ID derivation:', merchantIdDebug);
    
    if (!workspace || !workspace.merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_MERCHANT',
            message: 'No selected merchant/workspace',
          },
          debug: {
            merchantId: merchantIdDebug,
          },
        },
        { status: 400 }
      );
    }

    // 健康检查：先测试表是否存在
    const { data: healthCheck, error: healthError } = await supabase
      .from('merchant_change_requests')
      .select('id')
      .limit(1);

    if (healthError) {
      // 检查是否是表不存在
      if (healthError.code === '42P01' || healthError.message?.includes('does not exist')) {
        console.error('[event-change-requests][GET] Table does not exist:', {
          code: healthError.code,
          message: healthError.message,
          details: healthError.details,
          hint: healthError.hint,
          tableName: 'merchant_change_requests',
          schema: 'public',
        });
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TABLE_NOT_FOUND',
              message: 'merchant_change_requests table does not exist',
              details: {
                tableName: 'merchant_change_requests',
                schema: 'public',
                supabaseError: {
                  code: healthError.code,
                  message: healthError.message,
                  details: healthError.details,
                  hint: healthError.hint,
                },
              },
            },
            debug: {
              merchantId: merchantIdDebug,
            },
          },
          { status: 500 }
        );
      }

      // 其他健康检查错误
      console.error('[event-change-requests][GET] Health check failed:', {
        code: healthError.code,
        message: healthError.message,
        details: healthError.details,
        hint: healthError.hint,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'HEALTH_CHECK_FAILED',
            message: 'Failed to access merchant_change_requests table',
            details: {
              supabaseError: {
                code: healthError.code,
                message: healthError.message,
                details: healthError.details,
                hint: healthError.hint,
              },
            },
          },
          debug: {
            merchantId: merchantIdDebug,
          },
        },
        { status: 500 }
      );
    }

    // 健康检查通过，继续查询 (merchant_change_requests)
    let query = supabase
      .from('merchant_change_requests')
      .select('id, event_id, request_type, status, payload, created_at, reviewed_at, review_note')
      .eq('merchant_id', workspace.merchantId);

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // 如果没有指定 status，优先返回 pending，然后按时间倒序
    if (!status) {
      query = query.order('status', { ascending: true }) // pending 在前
                   .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    let { data: requests, error: fetchError } = await query;
    let usedServiceRole = false;

    // 如果是 RLS/permission denied 错误，使用 service role client
    if (fetchError && (fetchError.code === '42501' || fetchError.message?.includes('permission denied') || fetchError.message?.includes('RLS'))) {
      console.error('[event-change-requests][GET] RLS/permission denied, retrying with admin client:', {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
      });

      const adminClient = getAdminClient();
      if (!adminClient) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'SERVER_CONFIG_ERROR',
              message: 'Service role key not configured',
            },
            debug: {
              merchantId: merchantIdDebug,
            },
          },
          { status: 500 }
        );
      }

      usedServiceRole = true;
      let adminQuery = adminClient
        .from('merchant_change_requests')
        .select('id, event_id, request_type, status, payload, created_at, reviewed_at, review_note')
        .eq('merchant_id', workspace.merchantId);

      if (eventId) {
        adminQuery = adminQuery.eq('event_id', eventId);
      }

      if (status) {
        adminQuery = adminQuery.eq('status', status);
      }

      // 如果没有指定 status，优先返回 pending，然后按时间倒序
      if (!status) {
        adminQuery = adminQuery.order('status', { ascending: true }) // pending 在前
                             .order('created_at', { ascending: false });
      } else {
        adminQuery = adminQuery.order('created_at', { ascending: false });
      }

      const { data: adminRequests, error: adminError } = await adminQuery;

      if (adminError) {
        console.error('[event-change-requests][GET] Admin client fetch error:', {
          code: adminError.code,
          message: adminError.message,
          details: adminError.details,
          hint: adminError.hint,
        });
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FETCH_FAILED',
              message: adminError.message || 'Failed to fetch change requests',
              details: {
                supabaseError: {
                  code: adminError.code,
                  message: adminError.message,
                  details: adminError.details,
                  hint: adminError.hint,
                },
              },
            },
            debug: {
              merchantId: merchantIdDebug,
              usedServiceRole: true,
            },
          },
          { status: 500 }
        );
      }

      requests = adminRequests;
    } else if (fetchError) {
      console.error('[event-change-requests][GET] Fetch error:', {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: fetchError.message || 'Failed to fetch change requests',
            details: {
              supabaseError: {
                code: fetchError.code,
                message: fetchError.message,
                details: fetchError.details,
                hint: fetchError.hint,
              },
            },
          },
          debug: {
            merchantId: merchantIdDebug,
            usedServiceRole: false,
          },
        },
        { status: 500 }
      );
    }

    // 映射字段：merchant_change_requests → 兼容 event_change_requests 的 API 响应
    const mappedRequests = (requests || []).map((req: any) => ({
      id: req.id,
      event_id: req.event_id,
      request_type: req.request_type,
      status: req.status,
      payload_json: req.payload,
      submitted_at: req.created_at,
      approved_at: req.reviewed_at,
      rejection_reason: req.review_note,
      rejected_reason: req.review_note,
    }));

    return NextResponse.json({
      success: true,
      requests: mappedRequests,
      count: mappedRequests.length,
      debug: {
        usedServiceRole,
      },
    });

  } catch (error: any) {
    console.error('[event-change-requests][GET] Unexpected error:', error);
    
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
