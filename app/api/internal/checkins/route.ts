/**
 * POST /api/internal/checkins
 * 核销票据
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkinTicket } from '@/lib/data/internal/checkins';
import { getActiveWorkspace } from '@/lib/internal/workspace';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketCode, ticketId, action, venueId, deviceId, clientTs, note, idempotencyKey } = body;

    if (!ticketCode && !ticketId) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'ticketCode or ticketId is required' },
        { status: 400 }
      );
    }

    if (!action || !['ENTRY', 'DRINK'].includes(action)) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'action must be ENTRY or DRINK' },
        { status: 400 }
      );
    }

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json(
        { error: 'NO_WORKSPACE', message: 'No active workspace' },
        { status: 403 }
      );
    }

    // 使用ticketId或ticketCode
    const actualTicketId = ticketId || ticketCode;
    const actualVenueId = venueId || workspace.venueId;

    // 执行核销
    const result = await checkinTicket(
      actualTicketId,
      action,
      actualVenueId,
      deviceId,
      clientTs,
      note,
      idempotencyKey
    );

    // 映射结果到标准响应格式
    const statusCode = result.result === 'OK' ? 200 : 
                      result.result === 'ALREADY_USED' ? 409 :
                      result.result === 'WRONG_VENUE' ? 403 :
                      result.result === 'NOT_ALLOWED' ? 403 : 400;

    return NextResponse.json({
      result: result.result,
      reason: result.reason,
      ticketId: result.ticketId,
      remaining: result.remaining,
      success: result.success,
    }, { status: statusCode });

  } catch (error: any) {
    console.error('Error in checkin:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'CHECKIN_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
