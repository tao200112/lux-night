/**
 * Event Creation Page - DISABLED
 * 创建活动功能已禁用
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewEventPage() {
  const router = useRouter();

  useEffect(() => {
    // 自动重定向到活动列表页
    const timer = setTimeout(() => {
      router.push('/events');
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="relative w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center p-8">
      <div className="text-center">
        <span className="material-symbols-outlined text-gray-400 text-6xl mb-4 block">block</span>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Event Creation Disabled</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Creating new events is not available. Please edit existing events instead.
        </p>
        <Link
          href="/events"
          className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Back to Events
        </Link>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-4">
          Redirecting in 3 seconds...
        </p>
      </div>
    </div>
  );
}
