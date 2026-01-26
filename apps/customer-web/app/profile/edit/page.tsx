'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateProfile } from '@/lib/data/profile';

type Field = 'firstName' | 'lastName' | 'email' | 'phone';

export default function ProfileEditPage() {
  const router = useRouter();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Parse display_name into first/last
  useEffect(() => {
    if (!profile) return;
    const raw = (profile.display_name || '').trim();
    if (!raw) {
      setFirstName('');
      setLastName('');
      return;
    }
    const parts = raw.split(/\s+/);
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setPhone(profile.phone || '');
  }, [profile]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/profile/edit'));
    }
  }, [user, authLoading, router]);

  const handleSave = async () => {
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      const displayName = [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' ') || null;
      await updateProfile(user.id, { display_name: displayName, phone: phone.trim() || null });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const email = user.email || '';

  const row = (field: Field, label: string, value: string, setValue: (v: string) => void, readOnly?: boolean) => (
    <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
      <span className="text-white/60 text-sm w-24 shrink-0">{label}</span>
      {editing === field && !readOnly ? (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(null)}
          autoFocus
          className="flex-1 ml-4 bg-white/5 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm"
        />
      ) : (
        <span className="flex-1 ml-4 text-white truncate">{value || '—'}</span>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={() => setEditing(editing === field ? null : field)}
          className="ml-3 p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-primary"
          aria-label={`Edit ${label}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-8">
      <header className="sticky top-0 z-10 px-6 py-4 bg-background-dark/95 backdrop-blur-md border-b border-white/5 flex items-center gap-4">
        <Link href="/profile" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Edit Profile</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className="rounded-2xl bg-[#1A1D1F] border border-white/10 overflow-hidden">
          {row('firstName', 'First Name', firstName, setFirstName)}
          {row('lastName', 'Last Name', lastName, setLastName)}
          {row('email', 'Email', email, () => {}, true)}
          {row('phone', 'Phone', phone, setPhone)}
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {saved && <p className="mt-4 text-sm text-primary">Saved.</p>}
      </main>

      <div className="sticky bottom-0 left-0 right-0 max-w-md mx-auto px-6 py-4 bg-gradient-to-t from-background-dark to-transparent">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-xl bg-primary hover:bg-primary-hover text-background-dark font-bold disabled:opacity-60 transition-all"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
