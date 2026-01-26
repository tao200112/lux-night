/**
 * GET /api/admin/settings
 * Admin Settings API
 * 
 * 强制修复版：确保所有分支都返回响应，绝不 pending
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handlerWrapper,
  requireAdmin,
  withTimeout,
  type ApiResponse,
} from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 10000;

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  let step = 'init';

  try {
    // STEP 1: 权限检查
    step = 'auth_check';
    const authResult = await withTimeout(
      requireAdmin(request),
      TIMEOUT_MS,
      'requireAdmin'
    );

    if ('status' in authResult) {
      return authResult.response;
    }

    const { adminClient } = authResult;
    step = 'auth_ok';

    // STEP 2: 查询 Regions (设置中的地区列表)
    step = 'query_regions';
    const { data: regions, error: regionsError } = await withTimeout(
      Promise.resolve(
        adminClient
          .from('regions')
          .select('*')
          .order('name')
      ),
      TIMEOUT_MS,
      'regions query'
    );

    if (regionsError) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Database Error',
          code: 'QUERY_ERROR',
          message: regionsError.message,
          step,
        },
        { status: 500 }
      );
    }

    step = 'regions_ok';

    // STEP 3: 返回设置数据
    step = 'success';
    return NextResponse.json<ApiResponse>({
      ok: true,
      data: {
        regions: regions || [],
        hasPlacesKey: !!process.env.GOOGLE_MAPS_API_KEY,
      },
      step,
    });

  } catch (error: any) {
    console.error('[ADMIN SETTINGS GET] Error:', {
      step,
      error: error.message,
      stack: error.stack,
    });

    if (error.message?.includes('[TIMEOUT]')) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'Request Timeout',
          code: 'TIMEOUT',
          message: error.message,
          step,
        },
        { status: 504 }
      );
    }

    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
        step,
      },
      { status: 500 }
    );
  }
});
