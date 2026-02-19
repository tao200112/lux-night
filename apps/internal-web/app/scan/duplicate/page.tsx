/**
 * Duplicate Check-in Warning Page
 * 完全按照 uimerchant/scan__duplicate_warning/code.html 设计
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DuplicatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkedInAt = searchParams.get('checked_in_at') || '10:45 PM';
  const verifiedBy = searchParams.get('verified_by') || 'Sarah J.';
  const ticketId = searchParams.get('ticket_id') || '#TIX-88291';
  const ticketType = searchParams.get('ticket_type') || 'VIP Backstage Pass';
  const guestName = searchParams.get('guest_name') || 'Marcus Thorne';

  const handleBackToScan = () => {
    router.push('/scan');
  };

  return (
    <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display">
      {/* Top Navigation Bar */}
      <nav className="flex items-center justify-between px-6 py-4 bg-background-light dark:bg-background-dark">
        <button
          onClick={handleBackToScan}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-zinc-800 shadow-sm"
        >
          <span className="material-symbols-outlined text-zinc-900 dark:text-zinc-100">close</span>
        </button>
        <h2 className="text-zinc-900 dark:text-zinc-100 font-bold text-lg">Scan Result</h2>
        <div className="w-10"></div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        {/* Warning Status Header */}
        <div className="mb-2">
          <span className="text-primary text-sm font-bold tracking-[0.2em] uppercase">Warning</span>
        </div>

        {/* Central Alert Card */}
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-xl overflow-hidden border-t-8 border-primary">
          <div className="p-8 flex flex-col items-center text-center">
            {/* Large Warning Icon */}
            <div className="mb-6 bg-primary/10 p-6 rounded-full">
              <span className="material-symbols-outlined text-primary text-7xl filled">warning</span>
            </div>

            {/* Headline */}
            <h1 className="text-zinc-900 dark:text-zinc-100 text-3xl font-bold leading-tight mb-4">
              Already Checked In
            </h1>

            {/* EmptyState / Visual representation */}
            <div className="w-full bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-6 mb-8 border border-zinc-100 dark:border-zinc-800">
              <div className="flex flex-col items-center gap-4">
                <div className="bg-gray-300 dark:bg-gray-700 rounded-full w-20 h-20 border-4 border-white dark:border-zinc-700 shadow-md flex items-center justify-center">
                  <span className="material-symbols-outlined text-gray-400 text-4xl">person</span>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-900 dark:text-zinc-100 text-base font-semibold">
                    Checked in at {checkedInAt}
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    Verified by {verifiedBy}
                  </p>
                </div>
              </div>
            </div>

            {/* DescriptionList / Audit Details */}
            <div className="w-full space-y-3 mb-4">
              <div className="flex justify-between items-center py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Ticket ID</p>
                <p className="text-zinc-900 dark:text-zinc-100 text-sm font-mono font-medium">{ticketId}</p>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Type</p>
                <p className="text-zinc-900 dark:text-zinc-100 text-sm font-medium">{ticketType}</p>
              </div>
              <div className="flex justify-between items-center py-3">
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Guest</p>
                <p className="text-zinc-900 dark:text-zinc-100 text-sm font-medium">{guestName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-8 w-full max-w-sm">
          <button
            onClick={handleBackToScan}
            className="w-full h-14 bg-primary text-white font-bold text-base rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span>Back to Scanner</span>
          </button>
        </div>
      </main>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function DuplicatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <DuplicatePageContent />
    </Suspense>
  );
}
