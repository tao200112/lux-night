/**
 * GET /api/ambassadors
 * 获取绑定该商家的大使列表及邀请码使用次数
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    await requireInternalAuth();
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return NextResponse.json({ error: 'NO_WORKSPACE', message: 'No active workspace' }, { status: 403 });
    }

    const supabase = await createClient();

    const { data: invites, error: invitesError } = await supabase
      .from('ambassador_invites')
      .select('id, code, status, ambassador_id, ambassador:ambassadors(id, display_name)')
      .eq('merchant_id', workspace.merchantId)
      .eq('status', 'active');

    if (invitesError) {
      throw new Error(invitesError.message);
    }

    const inviteList = invites || [];
    const inviteIds = inviteList.map((i: any) => i.id);

    let usageByInvite: Record<string, number> = {};
    if (inviteIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('invite_id')
        .eq('merchant_id', workspace.merchantId)
        .in('invite_id', inviteIds)
        .in('status', ['paid', 'fulfilled', 'completed']);
      (orders || []).forEach((o: any) => {
        if (o.invite_id) {
          usageByInvite[o.invite_id] = (usageByInvite[o.invite_id] || 0) + 1;
        }
      });
    }

    const ambassadorsMap = new Map<string, { displayName: string; invites: any[] }>();
    inviteList.forEach((inv: any) => {
      const ambId = inv.ambassador_id;
      const amb = inv.ambassador;
      const displayName = (Array.isArray(amb) ? amb[0] : amb)?.display_name || 'Unknown';
      const usage = usageByInvite[inv.id] || 0;
      const entry = { id: inv.id, code: inv.code, usage };
      if (!ambassadorsMap.has(ambId)) {
        ambassadorsMap.set(ambId, { displayName, invites: [] });
      }
      ambassadorsMap.get(ambId)!.invites.push(entry);
    });

    const list = Array.from(ambassadorsMap.entries()).map(([ambassadorId, v]) => ({
      ambassadorId,
      displayName: v.displayName,
      invites: v.invites,
      totalUsage: v.invites.reduce((s, i) => s + i.usage, 0),
    })).sort((a, b) => b.totalUsage - a.totalUsage);

    return NextResponse.json({ ok: true, data: list });
  } catch (error: any) {
    console.error('[AMBASSADORS API] Error', error);
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    return NextResponse.json({ error: 'FETCH_FAILED', message: error.message }, { status: 500 });
  }
}
