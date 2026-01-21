/**
 * Join Confirm Page
 * 加入确认页面：显示邀请码信息，用户确认后加入商户
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface InvitePreview {
  valid: boolean;
  status: string;
  merchant: {
    id: string;
    name: string;
  } | null;
  venue: {
    id: string;
    name: string;
  } | null;
  role: string;
  max_uses: number;
  used_count: number;
  remaining_uses: number;
  expires_at: string | null;
  message?: string;
}

export default function JoinConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取邀请码预览
  useEffect(() => {
    if (!token) {
      setError('Missing invite token');
      setLoading(false);
      return;
    }

    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        // 调用 RPC 预览邀请码
        const res = await fetch('/api/invites/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.trim().toUpperCase() }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || data.error || 'Failed to preview invite code');
        }

        setPreview(data);
      } catch (err: any) {
        console.error('Preview error:', err);
        setError(err.message || 'Failed to load invite preview');
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [token]);

  // 确认加入
  const handleConfirm = async () => {
    if (!token || !preview?.valid) {
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // 调用 RPC 兑换邀请码
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim().toUpperCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to redeem invite code');
      }

      // 兑换成功，根据 memberships 数量决定跳转
      const memberships = data.memberships || [];
      
      if (memberships.length > 1) {
        // 多个工作区，跳转到工作区选择
        router.push('/workspaces');
      } else {
        // 单个工作区，根据角色跳转
        const role = data.role?.toLowerCase() || 'staff';
        if (role === 'staff') {
          router.push('/scan');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err: any) {
      console.error('Redeem error:', err);
      setError(err.message || 'Failed to redeem invite code. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="relative flex h-full min-h-screen w-full flex-col bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-gray-100">
        <div className="flex flex-col items-center justify-center flex-1 px-4">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading invite details...</p>
        </div>
      </div>
    );
  }

  if (error || !preview || !preview.valid) {
    const errorMessage = error || preview?.message || 'Invalid or expired invite code';
    const status = preview?.status || 'INVALID';

    return (
      <div className="relative flex h-full min-h-screen w-full flex-col bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-gray-100">
        {/* Header */}
        <div className="flex items-center px-4 pt-4">
          <Link href="/invite" className="p-2 -ml-2">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </Link>
        </div>

        {/* Error Content */}
        <div className="flex flex-col items-center justify-center flex-1 px-6 pb-20">
          <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-8">
            <span className="material-symbols-outlined text-4xl text-red-500">error</span>
          </div>
          <h2 className="text-[#0c1d1d] dark:text-white tracking-tight text-2xl font-bold text-center mb-4">
            {status === 'EXPIRED' ? 'Invite Expired' : 
             status === 'USED_UP' ? 'Invite Used Up' :
             status === 'DISABLED' ? 'Invite Disabled' :
             'Invalid Invite Code'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-base text-center mb-8">
            {errorMessage}
          </p>
          <Link
            href="/invite"
            className="px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-hover active:scale-95 transition-all"
          >
            Try Another Code
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-gray-100">
      {/* Header */}
      <div className="flex items-center px-4 pt-4">
        <Link href="/invite" className="p-2 -ml-2">
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-6 pb-20">
        {/* Preview Card */}
        <div className="mt-8 mb-8 p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-[#0c1d1d] dark:text-white mb-6">
            Join Workspace
          </h2>

          {/* Merchant Info */}
          {preview.merchant && (
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Merchant</div>
              <div className="text-lg font-semibold text-[#0c1d1d] dark:text-white">
                {preview.merchant.name}
              </div>
            </div>
          )}

          {/* Venue Info */}
          {preview.venue && (
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Venue</div>
              <div className="text-lg font-semibold text-[#0c1d1d] dark:text-white">
                {preview.venue.name}
              </div>
            </div>
          )}

          {/* Role */}
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Role</div>
            <div className="text-lg font-semibold text-[#0c1d1d] dark:text-white capitalize">
              {preview.role}
            </div>
          </div>

          {/* Remaining Uses */}
          {preview.remaining_uses > 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {preview.remaining_uses} of {preview.max_uses} uses remaining
            </div>
          )}
        </div>

        {/* Important Notice */}
        <div className="mb-6 p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400 text-xl">
              info
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                Important Notice
              </div>
              <div className="text-sm text-yellow-700 dark:text-yellow-300">
                By joining this workspace, you will be granted access as a{' '}
                <span className="font-semibold capitalize">{preview.role}</span>. 
                Make sure you have permission to join this workspace.
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          </div>
        )}

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={submitting || !preview.valid}
          className="w-full h-14 rounded-xl bg-primary text-white text-base font-semibold transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Joining...</span>
            </>
          ) : (
            <span>Confirm & Join</span>
          )}
        </button>
      </div>
    </div>
  );
}
