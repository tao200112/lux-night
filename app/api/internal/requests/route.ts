/**
 * GET /api/internal/requests
 * 获取申请列表
 * POST /api/internal/requests
 * 创建申请
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequests, createRequest } from '@/lib/data/internal/requests';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const requests = await getRequests(
      workspace.merchantId,
      status || undefined,
      type || undefined
    );

    return NextResponse.json({
      requests,
      count: requests.length,
    });
  } catch (error: any) {
    console.error('Error getting requests:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'FETCH_FAILED', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalAuth();
    const body = await req.json();
    const { type, payload, venueId } = body;

    if (!type || !payload) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'type and payload are required' },
        { status: 400 }
      );
    }

    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    const request = await createRequest(
      workspace.merchantId,
      type,
      payload,
      venueId || workspace.venueId || undefined
    );

    return NextResponse.json({
      request,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating request:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'CREATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
