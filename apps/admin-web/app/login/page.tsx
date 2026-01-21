/**
 * Admin Login Page
 * Admin Portal 登录页面（邮箱密码登录）
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailPassword, getSession, APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';
import { consumePostAuthRedirect, normalizeRelativePath } from '@lux-night/shared/auth';

function AdminLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 从查询参数获取 redirect，确保是安全的相对路径
  const redirectParam = mounted ? searchParams.get('redirect') : null;
  const redirectTo = normalizeRelativePath(redirectParam, DEFAULT_AFTER_LOGIN);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  
  // ============================================================
  // Phase 1: 诊断日志 - 检查 session
  // ============================================================
  useEffect(() => {
    const checkSession = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ADMIN LOGIN PAGE] ========================================');
          console.log('[ADMIN LOGIN PAGE] Checking existing session...');
        }

        // 使用 getSession 而不是 getUser（避免触发额外的 API 调用）
        const session = await getSession();
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ADMIN LOGIN PAGE] Session check result:', {
            hasSession: !!session,
            userId: session?.user?.id,
            userEmail: session?.user?.email,
          });
        }

        // 如果有 session，检查是否是 admin
        if (session?.user) {
          try {
            const meResponse = await fetch('/api/me', {
              credentials: 'include',
            });
            
            if (meResponse.ok) {
              const meData = await meResponse.json();
              const isAdmin = meData.roles?.is_admin === true;
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[ADMIN LOGIN PAGE] /api/me check result:', {
                  isAdmin,
                  hasRoles: !!meData.roles,
                });
              }

              // 只有在确认是 admin 后才跳转
            if (isAdmin) {
              if (process.env.NODE_ENV === 'development') {
                console.log('[ADMIN LOGIN PAGE] Admin confirmed, redirecting to:', redirectTo);
                console.log('[ADMIN LOGIN PAGE] ========================================');
              }
              router.replace(redirectTo);
              return;
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.log('[ADMIN LOGIN PAGE] User is not admin, attempting to ensure admin status...');
              }
              
              // 尝试确保管理员状态（创建 admin_users 记录）
              try {
                const ensureResponse = await fetch('/api/admin/ensure', {
                  method: 'POST',
                  credentials: 'include',
                });
                
                if (ensureResponse.ok) {
                  const ensureData = await ensureResponse.json();
                  if (ensureData.isAdmin) {
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[ADMIN LOGIN PAGE] Admin status ensured, redirecting to:', redirectTo);
                      console.log('[ADMIN LOGIN PAGE] ========================================');
                    }
                    router.replace(redirectTo);
                    return;
                  }
                }
              } catch (ensureErr) {
                if (process.env.NODE_ENV === 'development') {
                  console.error('[ADMIN LOGIN PAGE] Error ensuring admin status:', ensureErr);
                }
              }
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[ADMIN LOGIN PAGE] User is not admin, staying on login page');
                console.log('[ADMIN LOGIN PAGE] ========================================');
              }
            }
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.log('[ADMIN LOGIN PAGE] /api/me check failed:', meResponse.status);
                console.log('[ADMIN LOGIN PAGE] ========================================');
              }
            }
          } catch (err) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[ADMIN LOGIN PAGE] Error checking /api/me:', err);
              console.log('[ADMIN LOGIN PAGE] ========================================');
            }
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ADMIN LOGIN PAGE] No session found, staying on login page');
            console.log('[ADMIN LOGIN PAGE] ========================================');
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[ADMIN LOGIN PAGE] Error checking session:', err);
          console.log('[ADMIN LOGIN PAGE] ========================================');
        }
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [router, redirectTo]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ADMIN LOGIN PAGE] ========================================');
        console.log('[ADMIN LOGIN PAGE] Attempting sign in...');
      }

      const result = await signInWithEmailPassword(email, password);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ADMIN LOGIN PAGE] Sign in result:', {
          hasUser: !!result?.user,
          userId: result?.user?.id,
          hasSession: !!result?.session,
        });
      }
      
      if (result && result.user && result.session) {
        console.log('[ADMIN LOGIN PAGE] User authenticated:', result.user.id);
        
        // 等待 session cookie 写入（给服务器时间处理）
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 验证 session 是否已写入 cookie
        try {
          const verifyResponse = await fetch('/api/me', {
            credentials: 'include',
          });
          
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            const isAdmin = verifyData.roles?.is_admin === true;
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[ADMIN LOGIN PAGE] Session verification:', {
                isAdmin,
                hasRoles: !!verifyData.roles,
              });
            }

            if (isAdmin) {
              // 使用 window.location.replace 避免返回登录页
              if (process.env.NODE_ENV === 'development') {
                console.log('[ADMIN LOGIN PAGE] Admin confirmed, redirecting to:', redirectTo);
                console.log('[ADMIN LOGIN PAGE] ========================================');
              }
              window.location.replace(redirectTo);
            } else {
              // 尝试确保管理员状态
              if (process.env.NODE_ENV === 'development') {
                console.log('[ADMIN LOGIN PAGE] User is not admin, attempting to ensure admin status...');
              }
              
              try {
                const ensureResponse = await fetch('/api/admin/ensure', {
                  method: 'POST',
                  credentials: 'include',
                });
                
                if (ensureResponse.ok) {
                  const ensureData = await ensureResponse.json();
                  if (ensureData.isAdmin) {
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[ADMIN LOGIN PAGE] Admin status ensured, redirecting to:', redirectTo);
                      console.log('[ADMIN LOGIN PAGE] ========================================');
                    }
                    window.location.replace(redirectTo);
                    return;
                  }
                }
              } catch (ensureErr) {
                if (process.env.NODE_ENV === 'development') {
                  console.error('[ADMIN LOGIN PAGE] Error ensuring admin status:', ensureErr);
                }
              }
              
              setError('您没有管理员权限。请联系系统管理员添加管理员权限。');
              setLoading(false);
            }
          } else {
            // Session 可能还没写入，再等待一下
            await new Promise(resolve => setTimeout(resolve, 500));
            if (process.env.NODE_ENV === 'development') {
              console.log('[ADMIN LOGIN PAGE] Session not ready yet, redirecting anyway');
              console.log('[ADMIN LOGIN PAGE] ========================================');
            }
            window.location.replace(redirectTo);
          }
        } catch (verifyErr) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[ADMIN LOGIN PAGE] Error verifying session:', verifyErr);
            console.log('[ADMIN LOGIN PAGE] Redirecting anyway...');
            console.log('[ADMIN LOGIN PAGE] ========================================');
          }
          // 即使验证失败也跳转，让 middleware 处理
          window.location.replace(redirectTo);
        }
      } else {
        throw new Error('登录失败，请重试');
      }
    } catch (err: any) {
      console.error('[ADMIN LOGIN PAGE] Error:', err);
      setError(err.message || '登录失败，请检查邮箱和密码');
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface-light dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark p-6 shadow-lg">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-primary dark:text-white mb-2">
              Admin Portal
            </h1>
            <p className="text-sm text-text-secondary dark:text-gray-400">
              管理员登录
            </p>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded text-danger text-sm">
              {error}
            </div>
          )}
          
          {checkingSession && (
            <div className="mb-4 p-3 bg-info/10 border border-info/20 rounded text-info text-sm text-center">
              检查登录状态...
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-primary dark:text-white mb-2">
                邮箱
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin123@admin.lux-night.com"
                className="w-full px-4 py-3 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-primary dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-action"
                required
                disabled={loading || checkingSession}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-primary dark:text-white mb-2">
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full px-4 py-3 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg text-primary dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-action"
                required
                disabled={loading || checkingSession}
                autoComplete="current-password"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || checkingSession}
              className="w-full py-3 bg-primary-action hover:bg-primary-action/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
          
          <div className="mt-6 pt-6 border-t border-border-light dark:border-border-dark">
            <p className="text-xs text-center text-text-secondary dark:text-gray-400">
              默认账号: admin123@admin.lux-night.com<br />
              默认密码: a146129887
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <AdminLoginPageContent />
    </Suspense>
  );
}
