/**
 * Ambassadors Page
 * 大使列表：绑定该商家的大使信息及邀请码使用次数
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AmbassadorItem {
  ambassadorId: string;
  displayName: string;
  invites: Array<{ id: string; code: string; usage: number }>;
  totalUsage: number;
}

export default function AmbassadorsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<AmbassadorItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAmbassadors();
  }, []);

  const loadAmbassadors = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/ambassadors');
      if (!res.ok) throw new Error('Failed to load ambassadors');
      const json = await res.json();
      if (json.ok) setList(json.data || []);
    } catch (err: any) {
      setError(err.message);
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[430px] lg:max-w-2xl mx-auto min-h-screen bg-background-light dark:bg-background-dark pb-24">
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-sm font-semibold">Back</span>
          </Link>
          <h1 className="text-base font-bold">Ambassadors</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="p-4">
        {error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={loadAmbassadors}
              className="px-4 py-2 bg-primary text-white rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="bg-card-light dark:bg-card-dark rounded-xl p-8 border border-gray-100 dark:border-gray-800 text-center">
            <span className="material-symbols-outlined text-gray-400 text-4xl mb-2">group</span>
            <p className="text-gray-500 dark:text-gray-400">No ambassadors for this merchant</p>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map((amb) => (
              <div
                key={amb.ambassadorId}
                className="bg-card-light dark:bg-card-dark rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {amb.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{amb.displayName}</p>
                      <p className="text-xs text-gray-500">Code uses: {amb.totalUsage}</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {amb.invites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between px-4 py-2">
                      <span className="font-mono font-bold text-sm">{inv.code}</span>
                      <span className="text-sm text-gray-500">{inv.usage} uses</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
