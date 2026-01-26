'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/settings'));
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
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Account</h2>
          <div className="p-4 rounded-2xl bg-[#1E2224] border border-white/5 space-y-1">
            <p className="text-white/80 text-sm">Email: {user.email}</p>
            <p className="text-white/50 text-xs">Account changes (e.g. email) coming in a future update.</p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Payment</h2>
          <div className="p-4 rounded-2xl bg-[#1E2224] border border-white/5">
            <p className="text-white/60 text-sm">Payment methods — Coming soon.</p>
            <p className="text-white/40 text-xs mt-1">You can pay with card at checkout. Saved cards will appear here later.</p>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">About</h2>
          <div className="p-4 rounded-2xl bg-[#1E2224] border border-white/5">
            <p className="text-white/60 text-sm">Lux Night v2.4.0</p>
            <Link href="/support" className="text-primary/90 text-sm mt-2 inline-block">Help & Support</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
