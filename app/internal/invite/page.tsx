/**
 * Invite Code Gate Page
 * 邀请码门禁页面
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
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/internal/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim().toUpperCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Invalid invite code');
        setLoading(false);
        return;
      }

      // 如果只有一个workspace，直接跳转到join确认页
      if (data.memberships?.length === 1) {
        router.push('/internal/join');
      } else {
        // 多个workspace，跳转到workspace选择页
        router.push('/internal/workspaces');
      }
    } catch (err: any) {
      setError('Failed to redeem invite code. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto px-8 justify-center bg-background-light dark:bg-background-dark text-charcoal dark:text-white">
      {/* Header */}
      <div className="flex flex-col items-center mb-12">
        <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-primary text-4xl">
            lock_open
          </span>
        </div>
        <h1 className="text-charcoal dark:text-white tracking-tight text-[32px] font-bold leading-tight text-center">
          Enter Invite Code
        </h1>
        <p className="text-mid-gray dark:text-gray-400 text-base font-normal leading-relaxed mt-4 text-center max-w-[280px]">
          To access the venue management platform, please enter the unique invite code provided by your administrator.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full space-y-8">
        <div className="flex flex-col w-full">
          <div className="relative group">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="XLK-992"
              className="form-input block w-full text-center text-2xl font-semibold tracking-[0.2em] uppercase rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 h-20 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-0 focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              disabled={loading}
            />
            {/* Focus indicator */}
            <div className="absolute bottom-[-1.5rem] left-1/2 -translate-x-1/2 flex gap-1.5 opacity-40">
              <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-alert-red text-sm text-center">{error}</div>
        )}

        <div className="flex flex-col pt-4">
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-14 bg-primary text-white text-lg font-bold leading-normal tracking-[0.015em] shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="truncate">
              {loading ? 'Verifying...' : 'Verify Code'}
            </span>
          </button>
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-mid-gray/60 dark:text-gray-500 uppercase tracking-widest font-medium">
            <span className="material-symbols-outlined text-sm">verified_user</span>
            Secure Access Only
          </div>
        </div>
      </form>
    </div>
  );
}
