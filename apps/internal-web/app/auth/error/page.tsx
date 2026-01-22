/**
 * OAuth Error Page
 * 显示 OAuth 认证过程中的错误信息
 * 提供重试和返回登录页的选项
 */

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const error = mounted ? searchParams.get('error') : null;
  const errorDescription = mounted ? searchParams.get('error_description') : null;

  // 在客户端打印错误信息
  useEffect(() => {
    if (error) {
      console.error('[AUTH ERROR PAGE] ========================================');
      console.error('[AUTH ERROR PAGE] Error:', error);
      console.error('[AUTH ERROR PAGE] Description:', errorDescription);
      console.error('[AUTH ERROR PAGE] ========================================');
    }
  }, [error, errorDescription]);

  // 错误类型映射
  const getErrorDetails = (errorCode: string | null) => {
    switch (errorCode) {
      case 'server_error':
        return {
          title: 'Server Error',
          message: 'The authentication server encountered an error. This might be a temporary issue.',
          icon: '🔧',
        };
      case 'missing_code':
        return {
          title: 'Missing Code',
          message: 'OAuth callback did not receive the required authorization code.',
          icon: '⚠️',
        };
      case 'exchange_failed':
        return {
          title: 'Exchange Failed',
          message: 'Failed to exchange authorization code for session.',
          icon: '❌',
        };
      case 'access_denied':
        return {
          title: 'Access Denied',
          message: 'You denied the authentication request.',
          icon: '🚫',
        };
      default:
        return {
          title: 'Authentication Error',
          message: 'An error occurred during authentication.',
          icon: '⚠️',
        };
    }
  };

  const errorDetails = getErrorDetails(error);

  return (
    <div className="relative flex h-full min-h-screen w-full max-w-[430px] mx-auto flex-col bg-background-light dark:bg-background-dark">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Error Icon */}
        <div className="text-6xl mb-6">{errorDetails.icon}</div>

        {/* Error Title */}
        <h1 className="text-2xl font-bold text-[#0c1d1d] dark:text-white mb-3 text-center">
          {errorDetails.title}
        </h1>

        {/* Error Message */}
        <p className="text-base text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
          {errorDetails.message}
        </p>

        {/* Technical Details (Development/Preview only) */}
        {(process.env.NODE_ENV === 'development' || errorDescription) && (
          <div className="w-full max-w-md mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">
              Technical Details
            </h3>
            <div className="space-y-1 text-xs font-mono">
              <div className="text-red-700 dark:text-red-400">
                <span className="font-bold">Error Code:</span> {error || 'unknown'}
              </div>
              {errorDescription && (
                <div className="text-red-700 dark:text-red-400 break-words">
                  <span className="font-bold">Description:</span> {errorDescription}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 w-full max-w-md">
          {/* Retry Login Button */}
          <button
            onClick={() => router.push('/login')}
            className="w-full px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover transition-colors duration-200"
          >
            Try Again
          </button>

          {/* Back to Login (Text Link) */}
          <Link
            href="/login"
            className="text-center text-sm text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors duration-200"
          >
            ← Back to Login Page
          </Link>
        </div>

        {/* Help Text */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-500">
            If the problem persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
