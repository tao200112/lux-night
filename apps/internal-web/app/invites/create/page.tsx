/**
 * Create Staff Invite Page
 * 生成员工邀请码页面
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMerchantContext } from '@/contexts/MerchantContext';
import Link from 'next/link';

export default function CreateInvitePage() {
  const router = useRouter();
  const { workspace } = useMerchantContext();
  const [role, setRole] = useState<'staff' | 'manager'>('staff');
  const [maxUses, setMaxUses] = useState(10);
  const [expiresDays, setExpiresDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ token: string; role: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspace) {
      setError('No active workspace');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const res = await fetch('/api/invites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: workspace.merchantId,
          venueId: workspace.venueId || null,
          role,
          maxUses,
          expiresDays,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create invite code');
      }

      setSuccess({
        token: data.token,
        role: data.intended_role || role,
      });
    } catch (err: any) {
      console.error('Create invite error:', err);
      setError(err.message || 'Failed to create invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto bg-background-light dark:bg-background-dark font-display text-[#0c1d1d] dark:text-gray-100 min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold">Generate Invite</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-6">
        {error && (
          <div className="bg-alert-red/10 border border-alert-red/30 text-alert-red p-4 rounded-xl">
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-success/10 border border-success/30 text-success p-4 rounded-xl space-y-3">
            <p className="text-sm font-medium">Invite code created successfully!</p>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Invite Code</p>
              <p className="text-2xl font-bold tracking-wider">{success.token}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Role: {success.role.toUpperCase()}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(success.token);
                alert('Copied to clipboard!');
              }}
              className="w-full bg-success text-white py-2 rounded-lg text-sm font-medium"
            >
              Copy to Clipboard
            </button>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Role
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRole('staff')}
                  className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all ${
                    role === 'staff'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Staff
                </button>
                <button
                  type="button"
                  onClick={() => setRole('manager')}
                  className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all ${
                    role === 'manager'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Manager
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Max Uses
              </label>
              <input
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Expires in (days)
              </label>
              <input
                type="number"
                min="1"
                value={expiresDays}
                onChange={(e) => setExpiresDays(parseInt(e.target.value) || 30)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-14 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">person_add</span>
                  <span>Generate Invite Code</span>
                </>
              )}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
