'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function StaffToolsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    fetch('/api/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const staff = d?.roles?.is_admin || (d?.roles?.merchant_memberships?.length > 0);
        setAllowed(!!staff);
      })
      .catch(() => setAllowed(false));
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/staff-tools'));
    }
  }, [user, authLoading, router]);

  if (authLoading || (user && allowed === null)) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  if (allowed === false) {
    return (
      <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white items-center justify-center px-6">
        <span className="material-symbols-outlined text-4xl text-amber-500/80 mb-4">lock</span>
        <p className="text-white/80 text-center mb-6">This page is only available to staff and admins.</p>
        <Link href="/profile" className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold">Back to Account</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-8">
      <header className="sticky top-0 z-10 px-6 py-4 bg-background-dark/95 border-b border-white/5 flex items-center gap-4">
        <Link href="/profile" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Staff Tools</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Ticket verification help</h2>
          <div className="p-4 rounded-2xl bg-[#1E2224] border border-white/5 space-y-4">
            <div>
              <p className="text-white font-medium text-sm">How to verify</p>
              <p className="text-white/60 text-sm mt-1">Customers open the ticket in Wallet and tap “Show Ticket” to open the redeem screen. You need to tap “Tap 3 times to Redeem” three times to confirm. Only staff or admin accounts can complete redemption; the server will reject others.</p>
            </div>
            <div>
              <p className="text-white font-medium text-sm">Three taps</p>
              <p className="text-white/60 text-sm mt-1">The three-tap step is a safety check to avoid accidental redemption. The count resets if you leave the screen or wait too long.</p>
            </div>
            <div>
              <p className="text-white font-medium text-sm">Staff only</p>
              <p className="text-white/60 text-sm mt-1">Redemption is enforced on the server. Only users with a staff or admin role for the event’s merchant can redeem. If you don’t see the redeem button or get an error, your account may not have the right permissions.</p>
            </div>
            <div>
              <p className="text-white font-medium text-sm">Scanning (future)</p>
              <p className="text-white/50 text-sm mt-1">In-app scanning will be added later. For now, customers can show the ticket QR and you can open the /t/[token] link on your device to verify, then use the redeem flow if you have staff access.</p>
            </div>
          </div>
        </section>

        <p className="text-white/40 text-xs">For more help, contact your manager or internal support.</p>
      </main>
    </div>
  );
}
