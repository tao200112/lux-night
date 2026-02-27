/**
 * Admin Reject Change Request API
 * POST /api/admin/change-requests/[id]/reject - 拒绝修改申请
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
  if ('response' in rl) return rl.response;

  const authResult = await requireAdmin();
  if ('error' in authResult) {
    return authResult.error;
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { review_note } = body;

    const supabase = createAdminClient();

    // 更新申请状态
    const { data: updatedRequest, error: updateError } = await supabase
      .from('merchant_change_requests')
      .update({
        status: 'rejected',
        reviewed_by_admin: authResult.user.id,
        reviewed_at: new Date().toISOString(),
        review_note: review_note || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating request status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update request status', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ request: updatedRequest });
  } catch (error: any) {
    console.error('Error in POST /api/admin/change-requests/[id]/reject:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
