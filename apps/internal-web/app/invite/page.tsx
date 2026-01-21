/**
 * Invite Gate Page
 * 邀请码门禁页面：无 merchant_members 的用户必须输入邀请码
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InviteGatePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      setError('Please enter an invite code');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 直接调用兑换 API
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim().toUpperCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        // 跳转到 invalid 页面
        router.push(`/onboarding/invite/invalid?code=${encodeURIComponent(token.trim().toUpperCase())}`);
        return;
      }

      if (!data.ok) {
        // 跳转到 invalid 页面
        router.push(`/onboarding/invite/invalid?code=${encodeURIComponent(token.trim().toUpperCase())}`);
        return;
      }

      // 兑换成功，刷新页面让 middleware 重定向
      window.location.href = '/';
    } catch (err: any) {
      console.error('Invite redeem error:', err);
      // 跳转到 invalid 页面
      router.push(`/onboarding/invite/invalid?code=${encodeURIComponent(token.trim().toUpperCase())}`);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full max-w-[430px] mx-auto flex-col bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-gray-100">
      {/* Header */}
      <div className="flex flex-col items-center pt-20 pb-10 px-4">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-3xl">lock</span>
          </div>
        </div>
        <h2 className="text-[#0c1d1d] dark:text-white tracking-tight text-3xl font-bold leading-tight px-4 text-center">
          Invite Code Required
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-base font-normal leading-normal pt-2 px-4 text-center">
          Enter your invite code to access the internal workspace
        </p>
      </div>

      {/* Invite Code Form */}
      <div className="flex-grow flex flex-col justify-start items-center px-6">
        <div className="w-full max-w-[400px]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Input Field */}
            <div className="flex flex-col gap-2">
              <label htmlFor="invite-token" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Invite Code
              </label>
              <input
                id="invite-token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                disabled={loading}
                className="w-full h-14 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[#0c1d1d] dark:text-white text-base font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {error}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full h-14 rounded-xl bg-primary text-white text-base font-semibold transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Redeeming...</span>
                </>
              ) : (
                <span>Continue</span>
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Don't have an invite code?{' '}
              <button
                onClick={() => router.push('/login')}
                className="text-primary dark:text-primary/80 font-medium hover:underline"
              >
                Contact Support
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
