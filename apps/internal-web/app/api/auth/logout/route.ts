/**
 * POST /api/auth/logout
 * 登出当前用户（服务端）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimitOrResponse(req, rateLimitPolicies.publicBurst, { userId: 'anon' });
    if ('response' in rl) return rl.response;

    const supabase = await createClient();
    
    const { error } = await supabase.auth.signOut({
      scope: 'global',
    });

    if (error) {
      console.error('Error signing out:', error);
      return NextResponse.json(
        { error: 'LOGOUT_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('Error in logout:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
