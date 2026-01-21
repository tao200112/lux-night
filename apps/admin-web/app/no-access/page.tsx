/**
 * Admin No Access Page
 * 无权限访问页面
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminNoAccessPage() {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="material-symbols-outlined text-6xl text-danger">block</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Access Denied
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          You don't have permission to access the Admin portal. Only administrators can access this area.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
          >
            Go Back
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
