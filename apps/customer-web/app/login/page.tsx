'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithGoogle, signInWithApple, getUser, APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';
import { setPostAuthRedirect, normalizeRelativePath } from '@lux-night/shared/auth';
import Button from '@/components/ui/Button';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 从查询参数获取 redirect，确保是安全的相对路径
  const redirectParam = mounted ? searchParams.get('redirect') : null;
  const targetPath = normalizeRelativePath(redirectParam, DEFAULT_AFTER_LOGIN);

  useEffect(() => {
    // Check if already logged in
    getUser().then((user) => {
      if (user) {
        // Use replace to reset navigation stack when already logged in
        // This prevents back navigation from home to login
        router.replace('/');
      }
    });
  }, [router]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      // 存储登录后要跳转的路径
      setPostAuthRedirect(APP_NAME, targetPath);
      // 发起 OAuth 登录（回调到 /auth/callback）
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      // 存储登录后要跳转的路径
      setPostAuthRedirect(APP_NAME, targetPath);
      // 发起 OAuth 登录（回调到 /auth/callback）
      await signInWithApple();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  return (
    <div className="bg-background-dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        {/* Top center gold glow simulating a spotlight */}
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px]"></div>
      </div>
      
      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center justify-between min-h-[600px] py-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center mt-12 mb-8 w-full">
          <div className="mb-6 opacity-80">
            {/* Abstract Art Deco Logo Mark */}
            <svg className="text-primary" fill="none" height="48" viewBox="0 0 48 48" width="48" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 0L26.5 18L44 24L26.5 30L24 48L21.5 30L4 24L21.5 18L24 0Z" fill="currentColor"></path>
              <circle cx="24" cy="24" fill="#1a1a1a" r="3"></circle>
            </svg>
          </div>
          <h1 className="font-display text-primary text-5xl font-bold tracking-[0.2em] leading-tight text-center uppercase">
            Lux Night
          </h1>
          <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-secondary/50 to-transparent my-4"></div>
          <h2 className="font-display text-secondary text-xl italic tracking-wide text-center font-light">
            Elevate Your Night
          </h2>
        </div>

        {/* Authentication Zone */}
        <div className="w-full space-y-4 mb-8 px-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-alert-red/20 border border-alert-red/50 rounded-xl text-sm text-alert-red">
              {error}
            </div>
          )}

          {/* Apple Button */}
          <button 
            onClick={handleAppleSignIn}
            disabled={loading}
            className="group relative w-full h-14 bg-black hover:bg-zinc-900 border border-[#4A4A4A] rounded-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-lg hover:shadow-primary/5 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-white">
              <svg aria-hidden="true" fill="currentColor" height="20" viewBox="0 0 384 512" width="20">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 46.9 96.3 78.6 95.3 36-.8 49.4-26.2 93.3-26.2s56.5 25.2 92.1 26.2c32.8 1.1 66-61.9 79-98.3-25.9-11.2-42.5-35.8-42.7-83zm-63.1-125c15.7-19.1 26.2-45.7 23.3-72.2-22.7 1.2-50.6 15.3-67.4 34.8-15.8 17.9-29.6 46.2-25.8 71.9 25.1 1.8 51.5-15.3 69.9-34.5z"></path>
              </svg>
            </div>
            <span className="font-sans font-semibold text-white text-[15px] tracking-wide">
              {loading ? 'Signing in...' : 'Continue with Apple'}
            </span>
            {/* Subtle internal shine on hover */}
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"></div>
          </button>

          {/* Google Button */}
          <button 
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="group relative w-full h-14 bg-white hover:bg-gray-50 rounded-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center w-5 h-5">
              <svg height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <span className="font-sans font-semibold text-gray-900 text-[15px] tracking-wide">
              Continue with Google
            </span>
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 px-6">
          By continuing, you agree to our <a href="#" className="text-primary hover:underline">Terms of Service</a> and <a href="#" className="text-primary hover:underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
