/**
 * GET /api/admin/me
 * Admin Me API
 * 检查当前用户是否为 admin
 * 
 * 修复版：使用共享 requireAdmin()
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, withTimeout } from '@/lib/server/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  console.info('[ADMIN API]', {
    path: '/api/admin/me',
    step: 'ENTER',
    t: startTime,
  });

  try {
    // 使用共享 requireAdmin 函数（带超时）
    const authResult = await withTimeout(
      requireAdmin(),
      TIMEOUT_MS,
      'requireAdmin in /me'
    ).catch((error: Error) => {
      console.error('[ADMIN API]', {
        path: '/api/admin/me',
        step: 'TIMEOUT',
        error: error.message,
        t: Date.now(),
      });
      
      return {
        error: NextResponse.json(
          { success: false, code: 'TIMEOUT', message: 'Auth check timeout', label: 'requireAdmin' },
          { status: 504 }
        ),
      };
    });
    
    if ('error' in authResult) {
      console.warn('[ADMIN API]', {
        path: '/api/admin/me',
        step: 'AUTH_FAILED',
        t: Date.now(),
      });
      return authResult.error;
    }
    
    const { user, isAdmin, adminProfile } = authResult;
    
    console.info('[ADMIN API]', {
      path: '/api/admin/me',
      step: 'SUCCESS',
      userId: user.id,
      isAdmin,
      duration: `${Date.now() - startTime}ms`,
      t: Date.now(),
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        isAdmin,
        profile: adminProfile,
      },
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[ADMIN API]', {
      path: '/api/admin/me',
      step: 'ERROR',
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      t: Date.now(),
    });
    
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
      },
      { status: 500 }
    );
  }
}
