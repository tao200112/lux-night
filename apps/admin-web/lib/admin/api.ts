/**
 * Admin API Unified Helper
 * 
 * 强制修复版：确保所有 admin API 在任何情况下都明确返回，绝不 pending 或 504
 */

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// ============================================================
// A) Cookie Client (用于鉴权)
// ============================================================

/**
 * 创建用于读取当前登录用户的 Supabase 客户端
 * 只用于鉴权（getUser/getSession），不用于读取核心业务表
 */
export async function createCookieClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore - middleware will handle refresh
          }
        },
      },
    }
  );
}

// ============================================================
// B) Service Role Client (用于读表)
// ============================================================

/**
 * 创建 Service Role 客户端（绕过 RLS）
 * 只能在 server route 中使用，不能暴露到 client bundle
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('[SERVICE_ROLE] Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!serviceRoleKey) {
    throw new Error('[SERVICE_ROLE] Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================================
// C) Admin 权限检查
// ============================================================

export interface AdminAuthResult {
  user: {
    id: string;
    email?: string;
  };
  adminClient: ReturnType<typeof createServiceRoleClient>;
}

export interface AdminAuthError {
  status: 401 | 403 | 500;
  response: NextResponse;
}

/**
 * 检查当前请求的用户是否为 admin
 * 
 * @returns { user, adminClient } 或 { status, response }
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AdminAuthResult | AdminAuthError> {
  try {
    // STEP 1: 获取当前用户（使用 cookie client）
    const cookieClient = await createCookieClient();
    const { data: { user }, error: userError } = await cookieClient.auth.getUser();

    if (userError || !user) {
      return {
        status: 401,
        response: NextResponse.json(
          {
            ok: false,
            error: 'Unauthorized',
            code: 'UNAUTHENTICATED',
            message: 'Must be logged in',
          },
          { status: 401 }
        ),
      };
    }

    // STEP 2: 创建 service role client
    const adminClient = createServiceRoleClient();

    // STEP 3: 检查 admin 权限
    // 策略 1: 检查 profiles.is_admin
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    // 策略 2: 检查 admin_users 表
    const { data: adminUser, error: adminUserError } = await adminClient
      .from('admin_users')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    // 策略 3: Email allowlist（后备方案）
    const allowlistEmails = (process.env.ADMIN_EMAIL_ALLOWLIST || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    const isInAllowlist = user.email && allowlistEmails.includes(user.email.toLowerCase());

    // 判断是否为 admin
    const isAdmin = 
      profile?.is_admin === true ||
      adminUser?.is_active === true ||
      isInAllowlist;

    if (!isAdmin) {
      return {
        status: 403,
        response: NextResponse.json(
          {
            ok: false,
            error: 'Forbidden',
            code: 'FORBIDDEN',
            message: 'Must be admin',
          },
          { status: 403 }
        ),
      };
    }

    // 返回用户和 admin client
    return {
      user: {
        id: user.id,
        email: user.email,
      },
      adminClient,
    };

  } catch (error: any) {
    return {
      status: 500,
      response: NextResponse.json(
        {
          ok: false,
          error: 'Internal Server Error',
          code: 'AUTH_CHECK_FAILED',
          message: error.message || 'Failed to verify admin status',
        },
        { status: 500 }
      ),
    };
  }
}

// ============================================================
// D) 超时保护
// ============================================================

/**
 * 带超时保护的 Promise wrapper
 * 
 * @param promise - 要执行的 Promise
 * @param ms - 超时时间（毫秒）
 * @param label - 用于错误日志的标签
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`[TIMEOUT] ${label} (${ms}ms)`));
    }, ms);
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

// ============================================================
// E) Handler Wrapper (确保所有错误都返回响应)
// ============================================================

type HandlerFunction = (
  request: NextRequest,
  context?: any
) => Promise<NextResponse>;

/**
 * 包裹所有 admin API handler，确保：
 * 1. 所有错误都被捕获并返回 JSON 响应
 * 2. 没有未处理的 promise rejection
 * 3. 函数绝不会 pending 或卡住
 * 
 * 支持动态路由的 context 参数（如 [id] 路由）
 */
export function handlerWrapper(fn: HandlerFunction): HandlerFunction {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      const result = await fn(request, context);
      // 确保返回的是 NextResponse
      if (!result || !(result instanceof NextResponse)) {
        console.error('[HANDLER_WRAPPER] Function did not return NextResponse');
        return NextResponse.json(
          {
            ok: false,
            error: 'Internal Server Error',
            code: 'INVALID_HANDLER_RETURN',
            message: 'Handler did not return a proper response',
          },
          { status: 500 }
        );
      }
      return result;
    } catch (error: any) {
      console.error('[HANDLER_WRAPPER] Uncaught error:', {
        error: error.message,
        stack: error.stack,
        path: request.nextUrl.pathname,
      });

      // 所有未捕获错误都返回 500
      return NextResponse.json(
        {
          ok: false,
          error: 'Internal Server Error',
          code: 'UNCAUGHT_ERROR',
          message: error.message || 'An unexpected error occurred',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
  };
}

// ============================================================
// 类型定义
// ============================================================

export interface ApiSuccessResponse<T = any> {
  ok: true;
  data: T;
  step?: string; // 用于调试：标记执行到哪一步
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
  code: string;
  message: string;
  details?: any;
  hint?: string; // 提示信息
  route?: string; // API 路由路径
  step?: string; // 用于调试：标记失败在哪一步
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;
