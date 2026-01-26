'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SupportPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/support'));
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-8">
      <header className="sticky top-0 z-10 px-6 py-4 bg-background-dark/95 border-b border-white/5 flex items-center gap-4">
        <Link href="/profile" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Help & Support</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Contact</h2>
          <div className="p-4 rounded-2xl bg-[#1E2224] border border-white/5 space-y-2">
            <p className="text-white/80">Email: support@luxnight.com</p>
            <p className="text-white/50 text-sm">We typically respond within 24 hours.</p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">FAQ</h2>
          <div className="space-y-2">
            <div className="p-4 rounded-2xl bg-[#1E2224] border border-white/5">
              <p className="text-white font-medium text-sm">How do I view my tickets?</p>
              <p className="text-white/50 text-sm mt-1">Go to Wallet from the bottom navigation. Tap a ticket to see details and the QR code for entry.</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#1E2224] border border-white/5">
              <p className="text-white font-medium text-sm">Refund policy</p>
              <p className="text-white/50 text-sm mt-1">Refunds depend on the event. Check the event page for the specific policy. Contact support for requests.</p>
            </div>
          </div>
        </section>

        <p className="text-white/40 text-xs">More options (live chat, phone) coming soon.</p>
      </main>
    </div>
  );
}
