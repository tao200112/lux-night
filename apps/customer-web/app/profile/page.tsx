'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BottomTabBar from '@/components/ui/BottomTabBar';
import AccountHeaderCard from '@/components/AccountHeaderCard';
import AccountListItem from '@/components/AccountListItem';

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, logout, loading: authLoading } = useAuth();
  const [isStaff, setIsStaff] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch('/api/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const staff = d?.roles?.is_admin || (d?.roles?.merchant_memberships?.length > 0);
        setIsStaff(!!staff);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/profile'));
    }
  }, [user, authLoading, router]);

  const handleShare = async () => {
    const url = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
      : '';
    const text = 'Join me on Lux Night — tickets & parties';
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Lux Night', text, url });
        setToast('Shared');
      } else {
        await navigator.clipboard?.writeText(url || text);
        setToast('Copied');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setToast('Failed');
    } finally {
      setTimeout(() => setToast(null), 2000);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/');
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex flex-col items-center justify-center px-6">
        <p className="text-white/70 mb-4">Sign in to view your account.</p>
        <Link href="/login" className="px-6 py-3 rounded-xl bg-primary text-white font-semibold">
          Sign in
        </Link>
      </div>
    );
  }

  const avatarUrl = profile?.avatar_url ?? (user.user_metadata as any)?.avatar_url ?? null;

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-24">
      <header className="px-6 pt-6 pb-2">
        <h1 className="text-xl font-bold tracking-tight">Account</h1>
      </header>

      <main className="flex-1 px-6 overflow-y-auto no-scrollbar">
        <section className="mb-6">
          <AccountHeaderCard
            displayName={profile?.display_name || ''}
            email={user.email || undefined}
            avatarUrl={avatarUrl}
            href="/profile/edit"
            badge="Gold Member"
          />
        </section>

        <section className="flex flex-col gap-3 mb-6">
          <AccountListItem icon="share" label="Share" onClick={handleShare} subtitle="Invite friends" />
          <AccountListItem icon="receipt_long" label="My Orders" href="/orders" />
          <AccountListItem icon="credit_card" label="Payment Methods" href="/settings" subtitle="Coming soon" />
          <AccountListItem icon="contact_support" label="Help & Support" href="/help" />
          <AccountListItem icon="settings" label="Settings" href="/settings" />
        </section>

        {isStaff && (
          <section className="mb-6">
            <div className="rounded-xl bg-[#1A1D1F]/80 border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setStaffOpen((o) => !o)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary/80">verified_user</span>
                  <div>
                    <p className="text-white font-medium text-sm">Staff Corner</p>
                    <p className="text-white/50 text-xs">Ticket verification help</p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-white/40 transition-transform ${staffOpen ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              {staffOpen && (
                <div className="px-4 pb-4 pt-0 border-t border-white/5">
                  <p className="text-white/60 text-sm mb-3">
                    Tap &quot;Tap 3 times to Redeem&quot; to confirm. Only staff or admin can complete redemption.
                  </p>
                  <Link
                    href="/staff-tools"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 text-primary text-sm font-medium border border-primary/40"
                  >
                    Open Redeem Guide
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        <button
          onClick={handleLogout}
          className="w-full py-3 text-center text-sm font-medium text-white/70 hover:text-white border border-white/20 hover:border-white/30 rounded-xl transition-colors"
        >
          Log out
        </button>

        <footer className="mt-8 pb-4 text-center text-[10px] text-white/40 uppercase tracking-widest">
          <p>Privacy · Terms</p>
          <p className="mt-1">Lux Night v2.4.0</p>
        </footer>
      </main>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#1A1D1F] border border-primary/40 text-primary text-sm shadow-lg">
          {toast}
        </div>
      )}

      <BottomTabBar />
    </div>
  );
}
