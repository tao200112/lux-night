/**
 * Server-side Admin Authorization Utility
 * 
 * 用于所有 /api/admin/* routes 的统一权限检查
 * 避免 route-to-route fetch 导致的循环依赖和超时
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

export interface AdminAuthResult {
  user: User;
  isAdmin: boolean;
  adminProfile?: {
    id: string;
    email: string;
    is_admin: boolean;
  };
}

export interface AdminAuthError {
  error: NextResponse;
}

/**
 * 检查当前请求的用户是否为 admin
 * 
 * @throws 不抛出异常，而是返回 error response
 * @returns { user, isAdmin, adminProfile } 或 { error: NextResponse }
 */
export async function requireAdmin(): Promise<AdminAuthResult | AdminAuthError> {
  const startTime = Date.now();
  
  try {
    // 1. 获取当前用户（使用 server client 读取 cookies）
    console.log('[requireAdmin] STEP1: getting user from session');
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    const step1Time = Date.now() - startTime;
    console.log('[requireAdmin] STEP1 done:', {
      hasUser: !!user,
      userId: user?.id,
      duration: `${step1Time}ms`,
      error: userError?.message || null,
    });
    
    if (userError) {
      console.error('[requireAdmin] User error:', userError);
      return {
        error: NextResponse.json(
          { 
            success: false, 
            code: 'AUTH_ERROR', 
            message: 'Authentication failed',
            details: userError.message,
          },
          { status: 401 }
        ),
      };
    }
    
    if (!user) {
      console.warn('[requireAdmin] No user found');
      return {
        error: NextResponse.json(
          { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
          { status: 401 }
        ),
      };
    }
    
    // 2. 检查 admin 权限（使用 admin client 绕过 RLS）
    console.log('[requireAdmin] STEP2: checking admin status');
    const supabaseAdmin = createAdminClient();
    
    // Query admin_users (Primary Source of Truth)
    const adminUsersPromise = supabaseAdmin
        .from('admin_users')
        .select('user_id, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

    // Query profiles (Secondary: Display Info only) based on Schema 001
    // Note: profiles table DOES NOT have 'email' or 'is_admin' columns.
    const profilesPromise = supabaseAdmin
        .from('profiles')
        .select('id, display_name')
        .eq('id', user.id)
        .maybeSingle();

    const [adminUsersResult, profileResult] = await Promise.all([
      adminUsersPromise, 
      profilesPromise
    ]);
    
    const step2Time = Date.now() - startTime - step1Time;
    console.log('[requireAdmin] STEP2 done:', {
      hasAdminUser: !!adminUsersResult.data,
      hasProfile: !!profileResult.data,
      duration: `${step2Time}ms`,
      adminUsersError: adminUsersResult.error?.message || null,
      profileError: profileResult.error?.message || null,
    });
    
    // 判断是否为 admin (依靠 admin_users 表)
    const isAdmin = adminUsersResult.data?.is_active === true;
    
    const totalTime = Date.now() - startTime;
    console.log('[requireAdmin] COMPLETE:', {
      userId: user.id,
      isAdmin,
      totalDuration: `${totalTime}ms`,
    });
    
    if (!isAdmin) {
      console.warn('[requireAdmin] User is not admin:', user.email);
      return {
        error: NextResponse.json(
          { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
          { status: 403 }
        ),
      };
    }
    
    // Construct adminProfile for backward compatibility
    const adminProfile = {
      id: user.id,
      email: user.email || '',
      is_admin: true,
      display_name: profileResult.data?.display_name
    };
    
    return {
      user,
      isAdmin: true,
      adminProfile,
    };
    
  } catch (error: any) {
    console.error('[requireAdmin] Unexpected error:', error);
    return {
      error: NextResponse.json(
        { 
          success: false, 
          code: 'INTERNAL_ERROR', 
          message: 'Failed to verify admin status',
          details: error.message,
        },
        { status: 500 }
      ),
    };
  }
}

/**
 * 带超时保护的 Promise wrapper
 * 
 * @param promise - 要执行的 Promise
 * @param timeoutMs - 超时时间（毫秒）
 * @param label - 用于错误日志的标签
 * @returns Promise 结果或抛出超时错误
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms: ${label}`));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}
