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

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/login');
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
            avatarUrl={profile?.avatar_url}
            href="#"
          />
        </section>

        <section className="flex flex-col gap-3 mb-6">
          <AccountListItem icon="share" label="Share" href="/" subtitle="Invite friends" />
          <AccountListItem icon="receipt_long" label="My Orders" href="/orders" />
          <AccountListItem icon="credit_card" label="Payment Methods" href="/settings" subtitle="Coming soon" />
          <AccountListItem icon="contact_support" label="Help & Support" href="/support" />
          <AccountListItem icon="settings" label="Settings" href="/settings" />
          {isStaff && (
            <AccountListItem icon="verified_user" label="Staff Tools" href="/staff-tools" subtitle="Ticket verification help" />
          )}
        </section>

        <button
          onClick={handleLogout}
          className="w-full py-3 text-center text-sm font-medium text-red-400/90 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-colors"
        >
          Log out
        </button>

        <footer className="mt-8 pb-4 text-center text-[10px] text-white/40 uppercase tracking-widest">
          <p>Privacy · Terms</p>
          <p className="mt-1">Lux Night v2.4.0</p>
        </footer>
      </main>

      <BottomTabBar />
    </div>
  );
}
