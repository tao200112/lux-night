/**
 * Wrong Venue Error Page
 * 完全按照 uimerchant/scan__wrong_venue_error/code.html 设计
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function WrongVenuePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketVenueName = searchParams.get('ticket_venue') || 'The Sapphire Lounge';
  const currentVenueName = searchParams.get('current_venue') || 'Neon District HQ';

  const handleSwitchVenue = () => {
    // TODO: 实现切换 venue 的逻辑
    router.push('/workspaces');
  };

  const handleBackToScan = () => {
    router.push('/scan');
  };

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display transition-colors duration-300">
      {/* Top Navigation Bar */}
      <div className="flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 justify-between sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="text-primary flex size-12 shrink-0 items-center cursor-pointer"
        >
          <span className="material-symbols-outlined text-[28px]">arrow_back_ios_new</span>
        </button>
        <h2 className="text-[#1b0e10] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">Scan Ticket</h2>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Error Feedback Container */}
        <div className="w-full max-w-sm bg-white dark:bg-[#2d3139] rounded-xl p-8 shadow-lg border border-primary/10 flex flex-col items-center text-center">
          {/* Distinctive Error Icon */}
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary text-5xl">location_off</span>
          </div>

          {/* Headline Text */}
          <h1 className="text-primary tracking-tight text-[32px] font-bold leading-tight pb-4">
            Wrong Venue
          </h1>

          {/* Message with emphasized venue names */}
          <p className="text-[#1b0e10] dark:text-gray-300 text-lg font-normal leading-relaxed mb-8">
            This ticket is for <span className="text-primary font-bold">{ticketVenueName}</span>.
            <br/><br/>
            You are currently at <span className="font-bold border-b-2 border-primary/30">{currentVenueName}</span>.
          </p>

          {/* Image/Map Context (Small Visual Indicator) */}
          <div className="w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-8 relative">
            <div className="absolute inset-0 bg-cover bg-center opacity-80 bg-gradient-to-r from-primary/20 to-primary/10"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white/90 dark:bg-black/70 px-3 py-1 rounded-full text-xs font-bold text-primary shadow-sm uppercase tracking-widest">
                Location Mismatch
              </div>
            </div>
          </div>

          {/* Action Group */}
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={handleSwitchVenue}
              className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-14 px-5 bg-primary text-white text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-[0.98] transition-transform"
            >
              <span className="truncate">Switch to {ticketVenueName}</span>
            </button>
            <button
              onClick={handleBackToScan}
              className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-14 px-5 bg-primary/10 dark:bg-primary/20 text-primary text-base font-bold leading-normal tracking-[0.015em] w-full active:scale-[0.98] transition-transform"
            >
              <span className="truncate">Back to Scan</span>
            </button>
          </div>
        </div>

        {/* Help Link */}
        <p className="mt-8 text-gray-500 dark:text-gray-400 text-sm font-medium cursor-pointer hover:underline underline-offset-4">
          Need help? Contact Floor Manager
        </p>
      </main>

      {/* Bottom Spacing for iOS Home Indicator */}
      <div className="h-10"></div>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function WrongVenuePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <WrongVenuePageContent />
    </Suspense>
  );
}
