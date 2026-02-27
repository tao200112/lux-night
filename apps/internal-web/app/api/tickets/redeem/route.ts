
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Layer 1: anonymous IP burst gate
  const rl1 = await rateLimitOrResponse(req, rateLimitPolicies.publicBurst, { userId: 'anon' });
  if ('response' in rl1) return rl1.response;

  // 1. Auth Check (Staff Login)
  const supabase = await createClient(); // Await if server client needs it (Supabase SSR v5 might not, but safe)
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  // Layer 2: authenticated checkin rate limit
  const rl2 = await rateLimitOrResponse(req, rateLimitPolicies.checkinStrict, { userId: user.id });
  if ('response' in rl2) return rl2.response;

  // 2. Parse Body
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 });
  }
  
  const { token, redeem_method } = body;
  
  if (!token) {
    return NextResponse.json({ error: 'Token is required', code: 'MISSING_TOKEN' }, { status: 400 });
  }

  // 3. Admin Client for Privileged Operations
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 4. Fetch Ticket Info (with V2 relations)
  const { data: ticket, error: ticketErr } = await admin
    .from('tickets')
    .select(`
       id, 
       status, 
       redeemed_count, 
       redeem_limit, 
       redeemed_at,
       redeemed_by,
       valid_start_at, 
       valid_end_at, 
       public_token,
       event:events_v2!tickets_events_v2_id_fkey (merchant_id)
    `)
    .eq('public_token', token)
    .maybeSingle();

  if (ticketErr) {
    console.error('[Redeem API] Ticket fetch error:', ticketErr);
    return NextResponse.json({ error: 'Database error', code: 'DB_ERROR' }, { status: 500 });
  }

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // 5. Check Staff Permission
  const ev = Array.isArray(ticket.event) ? ticket.event[0] : ticket.event;
  const merchantId = ev?.merchant_id;
  
  if (!merchantId) {
    return NextResponse.json({ error: 'Ticket invalid (no merchant link)', code: 'DATA_INTEGRITY_ERROR' }, { status: 500 });
  }
  
  // Check Admin first
  const { data: adminUser } = await admin.from('admin_users').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  
  if (!adminUser) {
      // Check Merchant Member
      const { data: member } = await admin.from('merchant_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('merchant_id', merchantId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (!member || !['owner','admin','manager','staff'].includes(member.role)) {
          return NextResponse.json({ error: 'No permission to redeem this ticket', code: 'FORBIDDEN' }, { status: 403 });
      }
  }

  // 6. Logic Checks

  // A. Already redeemed (status=used): hard block, 409
  if (ticket.status === 'used') {
    return NextResponse.json(
      {
        alreadyRedeemed: true,
        code: 'ALREADY_REDEEMED',
        error: 'Ticket already redeemed',
        ticket: {
          id: ticket.id,
          status: 'used',
          redeemed_at: ticket.redeemed_at,
          redeemed_by: ticket.redeemed_by,
          redeemed_count: ticket.redeemed_count,
          redeem_limit: ticket.redeem_limit,
        },
      },
      { status: 409 }
    );
  }

  // B. Other invalid status
  if (ticket.status !== 'active') {
     return NextResponse.json({ 
         error: `Ticket cannot be redeemed (status: ${ticket.status})`, 
         code: 'STATUS_INVALID', 
         status: ticket.status 
     }, { status: 409 });
  }

  // C. Check Count Limit
  const currentCount = ticket.redeemed_count || 0;
  const limit = ticket.redeem_limit || 1;
  
  if (currentCount >= limit) {
      return NextResponse.json({ 
          error: 'Redeem limit reached', 
          code: 'LIMIT_REACHED',
          redeemedCount: currentCount,
          redeemLimit: limit
      }, { status: 409 });
  }

  // D. Time Window Check
  const now = new Date();
  const start = ticket.valid_start_at ? new Date(ticket.valid_start_at) : null;
  const end = ticket.valid_end_at ? new Date(ticket.valid_end_at) : null;
  
  const EARLY_MINS = parseInt(process.env.REDEEM_EARLY_MINUTES || '0', 10);
  const LATE_MINS = parseInt(process.env.REDEEM_LATE_MINUTES || '30', 10);

  if (start && end) {
      const windowStart = new Date(start.getTime() - EARLY_MINS * 60000);
      const windowEnd = new Date(end.getTime() + LATE_MINS * 60000);
      
      if (now < windowStart) return NextResponse.json({ error: 'Ticket not yet valid', code: 'TOO_EARLY', validFrom: windowStart.toISOString() }, { status: 422 });
      if (now > windowEnd) return NextResponse.json({ error: 'Ticket expired', code: 'EXPIRED', expiredAt: windowEnd.toISOString() }, { status: 422 });
  }

  // 7. Execute Redeem (optimistic lock: only update if still active to prevent race)
  const newCount = currentCount + 1;
  const newStatus = newCount >= limit ? 'used' : 'active';

  const { data: updated, error: updateErr } = await admin
    .from('tickets')
    .update({
        redeemed_count: newCount,
        status: newStatus,
        redeemed_at: new Date().toISOString(),
        redeemed_by: user.id,
        updated_at: new Date().toISOString()
    })
    .eq('id', ticket.id)
    .eq('status', 'active')  // Optimistic lock: prevent concurrent double-redeem
    .select('id, status, redeemed_count, redeem_limit, redeemed_at')
    .maybeSingle();

  if (updateErr) {
      console.error('[Redeem API] Update failed:', updateErr);
      return NextResponse.json({ error: 'Update failed', code: 'DB_UPDATE_ERROR' }, { status: 500 });
  }

  // Concurrent redeem: another request may have redeemed first
  if (!updated) {
      const { data: refetch } = await admin
        .from('tickets')
        .select('id, status, redeemed_count, redeem_limit, redeemed_at')
        .eq('id', ticket.id)
        .maybeSingle();
      return NextResponse.json({
          alreadyRedeemed: true,
          code: 'CONCURRENT_REDEEM',
          ticket: refetch
      }, { status: 409 });
  }

  console.log(`[Redeem API] Success: Ticket ${updated.id} Count ${newCount}/${limit} Method: ${redeem_method} By: ${user.id}`);

  return NextResponse.json({
      success: true,
      ticket: updated
  });
}
