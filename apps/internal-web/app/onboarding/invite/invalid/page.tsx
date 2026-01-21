/**
 * Invite Invalid Error Page
 * 完全按照 uimerchant/invite_gate__invalid_error/code.html 设计
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function InviteInvalidPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidCode = searchParams.get('code') || '';
  const [code, setCode] = useState(invalidCode);

  const handleRetry = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code.trim()) {
      return;
    }

    try {
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code.trim().toUpperCase() }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // 兑换成功，跳转
        window.location.href = '/';
      } else {
        // 仍然无效，留在当前页面（已经显示错误状态）
      }
    } catch (err) {
      // 错误已显示
    }
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-white min-h-screen flex flex-col">
      {/* iOS Status Bar Spacer */}
      <div className="h-[44px] w-full flex justify-between items-end px-6 pb-2 bg-background-light dark:bg-background-dark">
        <span className="text-xs font-semibold">9:41</span>
        <div className="flex gap-1.5 items-center">
          <span className="material-symbols-outlined text-[14px]">signal_cellular_4_bar</span>
          <span className="material-symbols-outlined text-[14px]">wifi</span>
          <span className="material-symbols-outlined text-[14px]">battery_full</span>
        </div>
      </div>

      {/* TopAppBar Navigation */}
      <div className="flex items-center px-4 py-3 justify-between">
        <button
          onClick={() => router.back()}
          className="flex size-10 items-center justify-start cursor-pointer hover:opacity-70 transition-opacity"
        >
          <span className="material-symbols-outlined text-[#0c1d1d] dark:text-white">arrow_back_ios</span>
        </button>
        <h2 className="text-sm font-bold uppercase tracking-widest text-center flex-1">Join Venue</h2>
        <div className="size-10 flex items-center justify-end">
          <span className="material-symbols-outlined opacity-0">more_horiz</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 px-6 pt-12">
        {/* HeadlineSection */}
        <div className="mb-2">
          <h1 className="text-[#0c1d1d] dark:text-white text-[32px] font-bold leading-tight tracking-tight">Enter Invite Code</h1>
        </div>

        {/* BodyText Section */}
        <div className="mb-10">
          <p className="text-[#526060] dark:text-gray-400 text-base font-normal leading-relaxed max-w-[320px]">
            Enter the unique 6-digit code provided by your venue manager to access the staff portal.
          </p>
        </div>

        {/* Input Section (Error State) */}
        <form onSubmit={handleRetry} className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#0c1d1d] dark:text-white mb-2 ml-1">
            Invite Code
          </label>
          <div className="relative group">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full h-16 px-5 rounded-xl border-2 border-error bg-white dark:bg-gray-800 text-xl font-medium tracking-[0.2em] uppercase focus:outline-none focus:ring-0 focus:border-error placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
              placeholder="e.g. 123456"
              type="text"
              maxLength={10}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-error">
              <span className="material-symbols-outlined font-bold">warning</span>
            </div>
          </div>

          {/* MetaText / Error Message */}
          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="text-error text-[13px] font-medium leading-normal animate-pulse">
              Invalid or expired invite code
            </span>
          </div>

          {/* Action Button */}
          <div className="mt-8">
            <button
              type="submit"
              disabled={!code.trim()}
              className="w-full h-14 flex items-center justify-center rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.98] transition-all text-white text-base font-semibold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined mr-2 text-[20px]">refresh</span>
              <span>Try Again</span>
            </button>
          </div>
        </form>

        {/* Helper Text */}
        <div className="mt-6 px-1">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Don't have a code? Contact your venue manager or{' '}
            <button
              onClick={() => router.push('/invite')}
              className="text-primary underline font-medium"
            >
              request access
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
