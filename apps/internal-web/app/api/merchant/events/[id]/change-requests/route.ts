/**
 * DEPRECATED: /api/merchant/events/[id]/change-requests
 * 此路由已废弃，请使用 /api/merchant/event-change-requests?event_id=<uuid>
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  console.warn('[DEPRECATED] /api/merchant/events/[id]/change-requests is deprecated. Use /api/merchant/event-change-requests?event_id=<uuid> instead.');
  
  // 重定向到新接口
  const newUrl = new URL('/api/merchant/event-change-requests', req.url);
  newUrl.searchParams.set('event_id', eventId);
  
  return NextResponse.redirect(newUrl, 308); // 308 Permanent Redirect
}
