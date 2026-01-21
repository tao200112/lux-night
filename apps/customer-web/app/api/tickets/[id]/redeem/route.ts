import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const ticketId = resolvedParams.id;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use RPC function checkin_ticket for atomic redemption
    // This enforces permissions and prevents double redemption
    const { data: result, error: rpcError } = await supabase.rpc('checkin_ticket', {
      p_ticket_id: ticketId,
      p_action: 'ENTRY', // Entry redemption
      p_device_id: null,
      p_client_ts: Date.now(),
      p_note: null,
    });

    if (rpcError) {
      // Check error code
      if (rpcError.code === 'P0001') {
        // Custom exception - parse message
        if (rpcError.message?.includes('UNAUTHORIZED')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (rpcError.message?.includes('INVALID_ARGUMENT')) {
          return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
      }

      console.error('Checkin RPC error:', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to redeem ticket' },
        { status: 500 }
      );
    }

    if (!result) {
      return NextResponse.json({ error: 'Failed to redeem ticket' }, { status: 500 });
    }

    // Check result from RPC
    if (result.result === 'OK') {
      return NextResponse.json({
        success: true,
        ticket: {
          id: result.ticket_id,
          remaining: result.remaining,
        },
      });
    } else if (result.result === 'ALREADY_USED') {
      return NextResponse.json(
        { error: 'Ticket already redeemed', alreadyRedeemed: true },
        { status: 400 }
      );
    } else if (result.result === 'NOT_ALLOWED') {
      return NextResponse.json(
        { error: 'You do not have permission to redeem tickets for this venue' },
        { status: 403 }
      );
    } else if (result.result === 'REFUNDED') {
      return NextResponse.json(
        { error: 'Ticket has been refunded', alreadyRedeemed: true },
        { status: 400 }
      );
    } else if (result.result === 'EXPIRED') {
      return NextResponse.json(
        { error: 'Ticket has expired', alreadyRedeemed: true },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: `Redemption failed: ${result.result}` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Ticket redemption error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to redeem ticket' },
      { status: 500 }
    );
  }
}
