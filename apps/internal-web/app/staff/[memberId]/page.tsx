/**
 * Staff Member Detail Page
 * 完全按照 uimerchant/staff_member_detail/code.html 设计
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface StaffMember {
  id: string;
  userId: string;
  role: string;
  isActive: boolean;
  displayName?: string;
  user?: {
    id: string;
    email: string;
    profile?: {
      full_name?: string;
      avatar_url?: string;
    };
  };
  venues?: Array<{
    venueId: string;
    venueName: string;
    isAssigned: boolean;
  }>;
}

export default function StaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = params.memberId as string;

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  useEffect(() => {
    if (memberId) {
      loadStaffDetail();
    }
  }, [memberId]);

  const loadStaffDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/staff/${memberId}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to load staff member');
      }

      const data = await res.json();
      setStaff(data.member || data);
    } catch (err: any) {
      console.error('Error loading staff:', err);
      setError(err.message || 'Failed to load staff member');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!staff) return;

    try {
      setUpdating(true);

      const res = await fetch(`/api/staff/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isActive: !staff.isActive,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update staff status');
      }

      // 重新加载数据
      await loadStaffDetail();
    } catch (err: any) {
      console.error('Error updating staff:', err);
      alert(err.message || 'Failed to update staff status');
    } finally {
      setUpdating(false);
    }
  };

  const handleDisableAccount = async () => {
    if (!confirm('Are you sure you want to disable this account?')) {
      return;
    }

    try {
      setUpdating(true);

      const res = await fetch(`/api/staff/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isActive: false,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to disable account');
      }

      await loadStaffDetail();
    } catch (err: any) {
      console.error('Error disabling account:', err);
      alert(err.message || 'Failed to disable account');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto min-h-screen bg-background-light dark:bg-background-dark p-8 flex flex-col items-center justify-center">
        <p className="text-alert-red text-center mb-4">{error || 'Staff member not found'}</p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          Go Back
        </button>
      </div>
    );
  }

  const fullName = staff.displayName || staff.user?.profile?.full_name || staff.user?.email?.split('@')[0] || 'Staff Member';

  const handleSaveName = async () => {
    if (!staff) return;
    try {
      setUpdating(true);
      const res = await fetch(`/api/staff/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName: editNameValue.trim() }),
      });
      if (!res.ok) throw new Error('Failed to update name');
      setEditNameOpen(false);
      await loadStaffDetail();
    } catch (err: any) {
      alert(err.message || 'Failed to update name');
    } finally {
      setUpdating(false);
    }
  };
  const email = staff.user?.email || '';
  const avatarUrl = staff.user?.profile?.avatar_url;

  return (
    <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-white min-h-screen pb-32">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="material-symbols-outlined text-primary">arrow_back_ios_new</span>
          </button>
          <h1 className="text-lg font-bold tracking-tight">Staff Detail</h1>
          <button
            onClick={() => {
              setEditNameValue(fullName);
              setEditNameOpen(true);
            }}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="material-symbols-outlined text-primary">edit</span>
          </button>
        </div>
      </nav>

      <main className="p-4 flex flex-col gap-6 max-w-md mx-auto pb-32">
        {/* Profile Header Card */}
        <section className="bg-white dark:bg-[#1a2e2e] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-gray-300 dark:bg-gray-700 border-4 border-primary/10 shadow-inner flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img alt={fullName} className="w-full h-full object-cover" src={avatarUrl} />
                ) : (
                  <span className="material-symbols-outlined text-gray-400 text-5xl">person</span>
                )}
              </div>
              {staff.isActive && (
                <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-white dark:border-[#1a2e2e] rounded-full" title="Active Now"></div>
              )}
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-primary dark:text-primary">{fullName}</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium">{staff.role}</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="material-symbols-outlined text-xs text-primary">verified</span>
                <span className="text-xs uppercase tracking-widest font-bold text-primary/80">ID: {memberId.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Status Toggle */}
        <section className="bg-white dark:bg-[#1a2e2e] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#0c1d1d] dark:text-white">Account Status</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {staff.isActive ? 'Active and can access the system' : 'Inactive and cannot access'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={staff.isActive}
                onChange={handleToggleStatus}
                disabled={updating}
                className="sr-only peer"
              />
              <div className={`w-11 h-6 rounded-full peer ${staff.isActive ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${staff.isActive ? 'translate-x-6' : 'translate-x-1'}`}></span>
              </div>
            </label>
          </div>
        </section>

        {/* Assigned Venues */}
        {staff.venues && staff.venues.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Assigned Venues</h3>
              <span className="text-xs font-bold text-primary">View All</span>
            </div>
            <div className="bg-white dark:bg-[#1a2e2e] rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {staff.venues.filter(v => v.isAssigned).map((venue) => (
                  <div key={venue.venueId} className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined">nightlife</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{venue.venueName}</p>
                      <p className="text-xs text-gray-400">Assigned Venue</p>
                    </div>
                    <span className="material-symbols-outlined text-gray-300">chevron_right</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Recent Activity (Placeholder - TODO: 实现真实数据) */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Recent Activity</h3>
            <span className="material-symbols-outlined text-gray-400 text-sm">history</span>
          </div>
          <div className="bg-white dark:bg-[#1a2e2e] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="text-center py-8 text-gray-400 text-sm">
              No recent activity
            </div>
          </div>
        </section>

        {/* Destructive Actions */}
        <section className="flex flex-col gap-3 mt-4">
          <button
            onClick={handleDisableAccount}
            disabled={updating || !staff.isActive}
            className="w-full h-14 rounded-xl border-2 border-danger text-danger font-bold flex items-center justify-center gap-2 hover:bg-danger/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">block</span>
            Disable Account
          </button>
          <button className="w-full h-14 rounded-xl bg-danger text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined">person_remove</span>
            Remove from Venue
          </button>
        </section>
      </main>

      {/* Edit Name Modal */}
      {editNameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold mb-4">Edit Display Name</h3>
            <input
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-4"
              placeholder="Display name"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditNameOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveName}
                disabled={updating || !editNameValue.trim()}
                className="flex-1 py-2 rounded-lg bg-primary text-white font-semibold disabled:opacity-50"
              >
                {updating ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
