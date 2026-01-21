/**
 * GET /api/auth/session
 * 客户端获取 session 的 API（用于同步服务端 cookie 到客户端）
 * 
 * POST /api/auth/session
 * 客户端同步 session 到服务器端 cookies
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('[CUSTOMER AUTH SESSION API] Error getting session:', error);
      return NextResponse.json(
        { session: null, error: error.message },
        { status: 200 }
      );
    }

    // DEBUG: 开发环境打印 session 状态
    if (process.env.NODE_ENV === 'development') {
      console.log('[CUSTOMER AUTH SESSION API] Session:', session ? `User: ${session.user.id}` : 'NULL');
    }

    return NextResponse.json({
      session,
      user: session?.user || null,
    });
  } catch (error: any) {
    console.error('[CUSTOMER AUTH SESSION API] Unexpected error:', error);
    return NextResponse.json(
      { session: null, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { access_token, refresh_token } = body;

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: 'Missing access_token or refresh_token' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // 使用 setSession 将客户端 session 同步到服务器端 cookies
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      console.error('[CUSTOMER AUTH SESSION API] Error setting session:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // DEBUG: 开发环境打印成功信息
    if (process.env.NODE_ENV === 'development' && data.session) {
      console.log('[CUSTOMER AUTH SESSION API] Session synced to server:', data.session.user.id);
    }

    return NextResponse.json({
      session: data.session,
      user: data.user,
    });
  } catch (error: any) {
    console.error('[CUSTOMER AUTH SESSION API] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
