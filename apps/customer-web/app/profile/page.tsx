'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BackButton from '../../components/ui/BackButton';
import BottomTabBar from '../../components/ui/BottomTabBar';
import { getRegion, Region } from '@/lib/data/regions';

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, logout, loading: authLoading } = useAuth();
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);

  useEffect(() => {
    if (profile?.last_region_id) {
      getRegion(profile.last_region_id).then(setCurrentRegion);
    }
  }, [profile?.last_region_id]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/profile'));
    }
  }, [user, authLoading, router]);

  const handleLogout = async () => {
    try {
      await logout();
      // Use replace to avoid adding to history stack and prevent back navigation to authenticated pages
      router.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden relative shadow-2xl bg-background-light dark:bg-background-dark">
      {/* Background Ambient Effect (Deep Blue Hint) */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-blue-900/10 dark:bg-blue-950/20 blur-[100px] pointer-events-none z-0"></div>

      {/* Top App Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <BackButton href="/" />
        <h1 className="text-lg font-bold tracking-wide uppercase text-slate-800 dark:text-white">Profile</h1>
        <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
          <span className="material-symbols-outlined text-slate-800 dark:text-white group-hover:text-primary transition-colors">notifications</span>
        </button>
      </header>

      <main className="relative z-10 flex-1 flex flex-col px-6 pb-24 overflow-y-auto no-scrollbar">
        {/* Profile Header */}
        <section className="flex flex-col items-center mt-4 mb-10">
          <div className="relative group cursor-pointer">
            {/* Gold Ring Animation/Effect */}
            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary/50 to-transparent opacity-70 blur-sm group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative w-28 h-28 rounded-full p-[2px] bg-gradient-to-b from-primary via-primary/50 to-transparent">
              <div className="w-full h-full rounded-full overflow-hidden bg-surface-dark relative">
                {profile?.avatar_url ? (
                  <img alt="Profile" className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-700" src={profile.avatar_url}/>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/20">
                    <span className="material-symbols-outlined text-4xl text-primary">person</span>
                  </div>
                )}
              </div>
            </div>
            {/* Gold Badge */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a] border border-primary/40 px-3 py-1 rounded-full shadow-lg shadow-black/50">
              <span className="material-symbols-outlined text-[14px] text-primary">verified</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Gold Member</span>
            </div>
          </div>
          <div className="mt-5 text-center space-y-1">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{profile?.display_name || user?.email?.split('@')[0] || 'User'}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{user?.email}</p>
          </div>
        </section>

        {/* Navigation Menu */}
        <section className="flex flex-col gap-3 mb-8">
          {/* Menu Item 1: My Orders */}
          <button className="group relative flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 shadow-sm hover:border-primary/50 dark:hover:border-primary/30 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined">receipt_long</span>
              </div>
              <span className="text-base font-semibold text-slate-800 dark:text-slate-200 group-hover:translate-x-1 transition-transform">My Orders</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">chevron_right</span>
          </button>

          {/* Menu Item 2: Help & Support */}
          <button className="group relative flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 shadow-sm hover:border-primary/50 dark:hover:border-primary/30 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined">contact_support</span>
              </div>
              <span className="text-base font-semibold text-slate-800 dark:text-slate-200 group-hover:translate-x-1 transition-transform">Help & Support</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">chevron_right</span>
          </button>

          {/* Menu Item 3: Change Region */}
          <button onClick={() => router.push('/?regionModal=true')} className="group relative flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 shadow-sm hover:border-primary/50 dark:hover:border-primary/30 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined">public</span>
              </div>
              <div className="flex flex-col items-start">
                <span className="text-base font-semibold text-slate-800 dark:text-slate-200 group-hover:translate-x-1 transition-transform">Change Region</span>
                <span className="text-xs text-slate-500 dark:text-slate-500">Currently: {currentRegion?.name || 'Not selected'}</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">chevron_right</span>
          </button>

          {/* Menu Item 4: Settings */}
          <button className="group relative flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 shadow-sm hover:border-primary/50 dark:hover:border-primary/30 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined">settings</span>
              </div>
              <span className="text-base font-semibold text-slate-800 dark:text-slate-200 group-hover:translate-x-1 transition-transform">Settings</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">chevron_right</span>
          </button>
        </section>

        {/* Special Staff Section */}
        <section className="mb-8">
          <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-[#121212] to-[#0a0a0a] p-5">
            {/* Abstract Pattern BG */}
            <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-primary/5 blur-2xl"></div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary/80">Staff Upgrades</h3>
              <span className="material-symbols-outlined text-primary/50 text-sm">lock_open</span>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-400">Enter your exclusive invite code to unlock VIP staff privileges.</p>
              <div className="flex gap-2">
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 uppercase tracking-widest transition-all" 
                  placeholder="INVITE-CODE" 
                  type="text"
                />
                <button className="bg-transparent border border-primary text-primary hover:bg-primary hover:text-black font-bold text-xs px-4 py-2 rounded-lg transition-colors uppercase tracking-wide">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Logout */}
        <button 
          onClick={handleLogout}
          className="mt-auto w-full py-3 text-center text-sm font-semibold text-red-500/80 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-colors"
        >
          Log Out
        </button>
        <p className="mt-4 text-center text-[10px] text-slate-600 dark:text-slate-600 uppercase tracking-widest">
          Lux Night v2.4.0
        </p>
      </main>

      {/* Bottom Tab Bar - Always visible */}
      <BottomTabBar />
    </div>
  );
}
