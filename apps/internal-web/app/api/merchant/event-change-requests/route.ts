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

// Zod 校验 Schema
const PostRequestSchema = z.object({
  event_id: z.string().uuid('event_id must be a valid UUID'),
  request_type: z.enum(['price_change', 'inventory_change', 'event_edit', 'poster_change', 'poster', 'price', 'inventory'], {
    errorMap: () => ({ message: 'request_type must be one of: price_change, inventory_change, event_edit, poster_change, poster, price, inventory' })
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
          },
        },
        { status: 400 }
      );
    }

    const { event_id, request_type, payload } = validationResult.data;

    // 标准化 request_type（兼容新旧格式）
    const normalizedRequestType = request_type === 'price_change' ? 'price' :
                                  request_type === 'inventory_change' ? 'inventory' :
                                  request_type === 'poster_change' ? 'poster' :
                                  request_type === 'event_edit' ? 'general' :
                                  request_type;

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    
    console.log('[event-change-requests][POST] Workspace:', {
      merchantId: workspace?.merchantId || 'NULL',
      venueId: workspace?.venueId || 'NULL',
      hasWorkspace: !!workspace,
      source: 'getActiveWorkspace()',
    });

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
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Must be logged in',
          },
          debug: {
            receivedKeys: Object.keys(body),
          },
        },
        { status: 401 }
      );
    }

    // 验证 event 属于当前 merchant
    const { data: event, error: eventError } = await supabase
      .from('events')
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
          },
        },
        { status: 403 }
      );
    }

    // 构造 insertData
    const insertData = {
      event_id,
      merchant_id: workspace.merchantId,
      request_type: normalizedRequestType,
      payload_json: payload,
      status: 'pending' as const,
      submitted_by: user.id,
    };

    console.log('[event-change-requests][POST] insertData=', insertData);

    // 先尝试使用普通 client 插入
    let { data: request, error: createError } = await supabase
      .from('event_change_requests')
      .insert(insertData)
      .select('id, request_type, status, payload_json, submitted_at, approved_at, rejected_reason')
      .single();

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
            },
          },
          { status: 500 }
        );
      }

      const { data: adminRequest, error: adminError } = await adminClient
        .from('event_change_requests')
        .insert(insertData)
        .select('id, request_type, status, payload_json, submitted_at, approved_at, rejected_reason')
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
        payload_json: request.payload_json,
        submitted_at: request.submitted_at,
        approved_at: request.approved_at,
        rejected_reason: request.rejected_reason,
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

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    
    console.log('[event-change-requests][GET] Workspace:', {
      merchantId: workspace?.merchantId || 'NULL',
      venueId: workspace?.venueId || 'NULL',
      hasWorkspace: !!workspace,
      source: 'getActiveWorkspace()',
    });
    
    if (!workspace || !workspace.merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_MERCHANT',
            message: 'No selected merchant/workspace',
          },
        },
        { status: 400 }
      );
    }

    // 先尝试使用普通 client
    const supabase = await createClient();

    let query = supabase
      .from('event_change_requests')
      .select('id, event_id, request_type, status, payload_json, submitted_at, approved_at, rejected_reason')
      .eq('merchant_id', workspace.merchantId);

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('submitted_at', { ascending: false });

    let { data: requests, error: fetchError } = await query;

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
          },
          { status: 500 }
        );
      }

      let adminQuery = adminClient
        .from('event_change_requests')
        .select('id, event_id, request_type, status, payload_json, submitted_at, approved_at, rejected_reason')
        .eq('merchant_id', workspace.merchantId);

      if (eventId) {
        adminQuery = adminQuery.eq('event_id', eventId);
      }

      if (status) {
        adminQuery = adminQuery.eq('status', status);
      }

      adminQuery = adminQuery.order('submitted_at', { ascending: false });

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
              details: adminError.details,
              hint: adminError.hint,
            },
          },
          { status: 500 }
        );
      }

      requests = adminRequests;
    } else if (fetchError) {
      // 检查是否是表不存在
      if (fetchError.code === '42P01' || fetchError.message?.includes('does not exist')) {
        console.error('[event-change-requests][GET] Table does not exist:', fetchError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TABLE_NOT_FOUND',
              message: 'event_change_requests table does not exist. Please run migration: supabase/migrations/024_add_request_type_to_event_change_requests.sql',
            },
          },
          { status: 501 }
        );
      }

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
            details: fetchError.details,
            hint: fetchError.hint,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      requests: requests || [],
      count: requests?.length || 0,
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
