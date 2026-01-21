/**
 * POST /api/auth/clear-cookies
 * 清理旧的 auth cookie（用于修复 431 错误）
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    
    // 找出所有 Supabase auth 相关的 cookie
    const authCookies = allCookies.filter(cookie => 
      cookie.name.includes('sb-') || 
      cookie.name.includes('auth-token') ||
      cookie.name.includes('auth-code')
    );
    
    // 清理这些 cookie
    const response = NextResponse.json({ 
      cleared: authCookies.length,
      cookies: authCookies.map(c => c.name)
    });
    
    authCookies.forEach(cookie => {
      // 设置 cookie 过期（立即过期）
      response.cookies.set(cookie.name, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });
    });
    
    // DEBUG: 开发环境打印清理的 cookie
    if (process.env.NODE_ENV === 'development') {
      console.log('[CLEAR COOKIES] Cleared', authCookies.length, 'cookies:', authCookies.map(c => c.name));
    }
    
    return response;
  } catch (error: any) {
    console.error('[CLEAR COOKIES] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
