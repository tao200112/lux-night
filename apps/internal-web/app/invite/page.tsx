/**
 * Invite Gate Page
 * 邀请码门禁页面：无 merchant_members 的用户必须输入邀请码
 * 
 * 显示条件：
 * - 用户已登录，但没有任何 merchant membership
 * - 需要通过邀请码加入商户才能访问内部功能
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function InviteGateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 获取 reason 参数
  const reason = mounted ? searchParams.get('reason') : null;

  // 根据 reason 显示不同的提示
  const getReasonMessage = () => {
    switch (reason) {
      case 'no_membership':
        return 'You are not currently a member of any merchant. Please enter an invite code to join.';
      case 'query_error':
        return 'Unable to verify your membership status. Please enter an invite code.';
      case 'error':
        return 'An error occurred during login. Please enter an invite code to continue.';
      default:
        return 'Enter your invite code to access the internal workspace';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      setError('Please enter an invite code');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[INVITE] Submitting code:', token.trim());

      // 调用新的邀请码兑换 API
      const res = await fetch('/api/invite/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: token.trim() }),
      });

      const data = await res.json();
      
      console.log('[INVITE] API response:', { status: res.status, data });

      if (!res.ok || !data.success) {
        // 显示错误消息（包含 error + step + debugId）
        let errorMessage = data.error || 'Failed to redeem invite code. Please try again.';
        
        // 如果有 step 和 debugId，添加到错误消息中
        if (data.step || data.debugId) {
          const parts: string[] = [errorMessage];
          if (data.step) {
            parts.push(`(Step: ${data.step})`);
          }
          if (data.debugId) {
            parts.push(`(Debug ID: ${data.debugId})`);
          }
          errorMessage = parts.join(' ');
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // 兑换成功，跳转到工作台
      console.log('[INVITE] ✅ Invite redeemed successfully, redirecting to:', data.data.next);
      router.push(data.data.next || '/workspaces');
    } catch (err: any) {
      console.error('[INVITE] ❌ Error redeeming invite:', err);
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
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
          {getReasonMessage()}
        </p>
        
        {/* Additional info for returning users */}
        {reason === 'no_membership' && (
          <div className="mt-4 px-4 max-w-md">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Welcome back!</strong> Your account is active, but you need to join a merchant to access the workspace. 
                Please contact your merchant owner to get an invite code.
              </p>
            </div>
          </div>
        )}
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

export default function InviteGatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <InviteGateContent />
    </Suspense>
  );
}
