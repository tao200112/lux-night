import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use Service Role for validation to ensure we can see all active invites regardless of RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  let merchantId = searchParams.get('merchantId');
  const eventId = searchParams.get('eventId');
  const debugId = Math.random().toString(36).substring(7);

  console.log(`[INVITE VALIDATE] ${debugId} Init: code=${code}, merchantId=${merchantId}, eventId=${eventId}`);

  if (!code || (!merchantId && !eventId)) {
    return NextResponse.json(
      { ok: false, valid: false, message: 'Missing code or context (merchantId/eventId)' },
      { status: 400 }
    );
  }

  try {
    // Resolve Merchant ID from Event if necessary
    if (!merchantId && eventId) {
        const { data: evt } = await supabaseAdmin
            .from('events_v2')
            .select('merchant_id')
            .eq('id', eventId)
            .single();
        
        if (evt) {
            merchantId = evt.merchant_id;
        } else {
            return NextResponse.json({
                ok: true, valid: false, message: 'Invalid Event', debugId
            });
        }
    }

    const normalizedCode = code.trim().toUpperCase();

    // Fetch Invite with Ambassador info
    const { data: invite, error } = await supabaseAdmin
      .from('ambassador_invites')
      .select(`
        id,
        code,
        status,
        max_uses,
        uses_count,
        merchant_id,
        ambassador:ambassadors (
          id,
          display_name
        )
      `)
      .eq('code', normalizedCode)
      .single();

    if (error || !invite) {
      console.log(`[INVITE VALIDATE] ${debugId} Not Found or Error`, error);
      return NextResponse.json({
        ok: true,
        valid: false,
        message: 'Invalid code',
        debugId
      });
    }

    // 1. Check Status
    if (invite.status !== 'active') {
        return NextResponse.json({
            ok: true,
            valid: false,
            message: 'Code is inactive',
            debugId
        });
    }

    // 2. Check Merchant
    if (invite.merchant_id !== merchantId) {
        return NextResponse.json({
            ok: true,
            valid: false,
            message: 'Code not valid for this merchant',
            debugId
        });
    }

    // 3. Check Usage Limits
    if (invite.max_uses !== null && invite.uses_count >= invite.max_uses) {
        return NextResponse.json({
            ok: true,
            valid: false,
            message: 'Used up', // Frontend can show "⚠️ Used up"
            debugId
        });
    }

    // Valid
    // @ts-ignore
    const ambassadorName = invite.ambassador?.display_name || 'Unknown Ambassador';
    const remainingUses = invite.max_uses ? (invite.max_uses - invite.uses_count) : null;

    return NextResponse.json({
      ok: true,
      valid: true,
      ambassadorName,
      merchantId: invite.merchant_id,
      remainingUses,
      code: invite.code, // return normalized code
      debugId
    });

  } catch (err: any) {
    console.error(`[INVITE VALIDATE] ${debugId} Exception`, err);
    return NextResponse.json(
      { ok: false, valid: false, message: 'Server error', error: err.message, debugId },
      { status: 500 }
    );
  }
}
