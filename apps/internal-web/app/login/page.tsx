/**
 * Internal Login Page
 * 内部端登录页面
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithGoogle, signInWithApple, APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';
import { setPostAuthRedirect, normalizeRelativePath } from '@lux-night/shared/auth';

function InternalLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 从查询参数获取 redirect，确保是安全的相对路径
  const redirectParam = mounted ? searchParams.get('redirect') : null;
  const targetPath = normalizeRelativePath(redirectParam, DEFAULT_AFTER_LOGIN);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      // 存储登录后要跳转的路径
      setPostAuthRedirect(APP_NAME, targetPath);
      // 发起 OAuth 登录（回调到 /auth/callback）
      await signInWithGoogle();
    } catch (error) {
      console.error('Google login error:', error);
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setLoading(true);
      // 存储登录后要跳转的路径
      setPostAuthRedirect(APP_NAME, targetPath);
      // 发起 OAuth 登录（回调到 /auth/callback）
      await signInWithApple();
    } catch (error) {
      console.error('Apple login error:', error);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full max-w-[430px] mx-auto flex-col bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-gray-100">
      {/* Top Logo/Brand Mark Section */}
      <div className="flex flex-col items-center pt-20 pb-10 px-4">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-3xl">nightlife</span>
          </div>
        </div>
        <h2 className="text-[#0c1d1d] dark:text-white tracking-tight text-3xl font-bold leading-tight px-4 text-center">
          Staff & Merchant Login
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-base font-normal leading-normal pt-2 px-4 text-center">
          Access your venue management workspace
        </p>
      </div>

      {/* SSO Login Section */}
      <div className="flex-grow flex flex-col justify-start items-center px-6">
        <div className="w-full max-w-[400px] flex flex-col gap-4">
          {/* Google Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex items-center justify-center gap-3 w-full h-14 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[#0c1d1d] dark:text-white text-base font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Apple Button */}
          <button
            onClick={handleAppleLogin}
            disabled={loading}
            className="flex items-center justify-center gap-3 w-full h-14 rounded-xl bg-black dark:bg-white text-white dark:text-black text-base font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M17.05 20.28c-.96.95-2.05 1.72-3.13 1.72-1.09 0-1.46-.68-2.73-.68-1.27 0-1.7.67-2.71.67-1.02 0-2.12-.76-3.14-1.74-2.11-2.07-3.66-5.83-3.66-9.15 0-5.29 3.29-8.09 6.39-8.09 1.63 0 2.92.57 3.86 1.15.91.56 1.44.88 2.05.88.5 0 .93-.24 1.7-.73.91-.58 2.14-1.3 3.9-1.3 2.76 0 5.17 1.83 6.14 4.54-5.32 2.21-4.46 9.07.82 11.23-.53 1.34-1.23 2.61-2.28 3.7zm-4.32-15.54c0-2.11 1.74-3.81 3.83-3.81.05 0 .11 0 .16.01.07 2.22-1.92 4.16-3.86 4.16-.06 0-.11 0-.16-.01-.13-.08-.25-.17-.37-.28-.2-.19-.34-.41-.45-.64-.12-.24-.18-.51-.18-.79z" />
            </svg>
            <span>Continue with Apple</span>
          </button>

          {/* Visual Divider */}
          <div className="flex items-center gap-4 my-4">
            <div className="h-px flex-grow bg-gray-200 dark:bg-gray-700"></div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-widest">
              Internal Use
            </span>
            <div className="h-px flex-grow bg-gray-200 dark:bg-gray-700"></div>
          </div>

          {/* Support Link */}
          <button className="text-primary dark:text-primary/80 text-sm font-medium hover:underline py-2">
            Difficulty logging in? Contact Support
          </button>
        </div>
      </div>

      {/* Footer Section */}
      <div className="pb-10 px-6 mt-auto">
        <div className="flex flex-col items-center gap-2">
          <p className="text-gray-400 dark:text-gray-500 text-xs font-normal leading-normal text-center">
            By signing in, you agree to our
          </p>
          <div className="flex gap-4">
            <a
              className="text-[#0c1d1d] dark:text-gray-300 text-xs font-semibold hover:underline decoration-primary"
              href="#"
            >
              Terms of Service
            </a>
            <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mt-1.5"></div>
            <a
              className="text-[#0c1d1d] dark:text-gray-300 text-xs font-semibold hover:underline decoration-primary"
              href="#"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function InternalLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f1212] dark:bg-[#0f1212] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <InternalLoginPageContent />
    </Suspense>
  );
}
