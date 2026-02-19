/**
 * New Event Request Page (Step 1: Basic Info)
 * 完全按照 uimerchant/new_event_request/code.html 设计
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMerchantContext } from '@/contexts/MerchantContext';
import PageContainer from '@/components/layout/PageContainer';

interface Venue {
  id: string;
  name: string;
}

export default function NewEventRequestPage() {
  const router = useRouter();
  const { workspace, memberships } = useMerchantContext();

  const [loading, setLoading] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [venueId, setVenueId] = useState<string>('');
  const [ageRestriction21, setAgeRestriction21] = useState(true);
  const [guestlistEnabled, setGuestlistEnabled] = useState(false);

  useEffect(() => {
    // 从 memberships 获取 venues
    if (memberships && memberships.length > 0) {
      const allVenues: Venue[] = [];
      memberships.forEach((m) => {
        m.venues?.forEach((v) => {
          allVenues.push({ id: v.venueId, name: v.venueName });
        });
      });
      setVenues(allVenues);
      
      // 默认选择当前 workspace 的 venue
      if (workspace?.venueId) {
        setVenueId(workspace.venueId);
      } else if (allVenues.length > 0) {
        setVenueId(allVenues[0].id);
      }
    }
  }, [memberships, workspace]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !startDate || !startTime || !venueId) {
      return;
    }

    try {
      setLoading(true);

      // 合并日期和时间
      const startDateTime = new Date(`${startDate}T${startTime}`);
      if (isNaN(startDateTime.getTime())) {
        alert('Invalid date/time');
        return;
      }

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'NEW_EVENT',
          payload: {
            title: title.trim(),
            start_at: startDateTime.toISOString(),
            venue_id: venueId,
            age_restriction_21: ageRestriction21,
            guestlist_enabled: guestlistEnabled,
            staff_count: 0, // TODO: 后续步骤添加
          },
          venueId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit request');
      }

      // 成功，返回请求列表
      router.push('/requests');
    } catch (err: any) {
      console.error('Error submitting request:', err);
      alert(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer className="bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-white min-h-screen flex flex-col pb-32">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center p-4 justify-between w-full">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[#0c1d1d] dark:text-gray-100 cursor-pointer">arrow_back_ios</span>
          </button>
          <h1 className="text-[#0c1d1d] dark:text-gray-100 text-lg font-bold leading-tight tracking-tight flex-1 text-center">New Event Request</h1>
          <div className="flex w-12 items-center justify-end">
            <button
              onClick={() => router.back()}
              className="text-primary text-base font-semibold leading-normal"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="flex w-full flex-row items-center justify-center gap-6 py-4 bg-white dark:bg-gray-900/50">
          <div className="flex flex-col items-center gap-1">
            <div className="h-2 w-12 rounded-full bg-primary"></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Details</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-2 w-12 rounded-full bg-primary/20 dark:bg-gray-700"></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Policies</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-2 w-12 rounded-full bg-primary/20 dark:bg-gray-700"></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tickets</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full pb-32">
        <form onSubmit={handleSubmit}>
          {/* Section: Event Details */}
          <section className="mt-4">
            <h2 className="text-[#0c1d1d] dark:text-gray-100 text-[20px] font-bold px-4 mb-4">Event Details</h2>
            <div className="px-4 space-y-4">
              <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <label className="flex flex-col w-full">
                  <p className="text-[#0c1d1d] dark:text-gray-300 text-sm font-medium pb-2">Event Title</p>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Midnight Renaissance"
                    className="flex w-full rounded-lg text-[#0c1d1d] dark:text-white border border-[#cdeaea] dark:border-gray-700 bg-transparent focus:border-primary focus:ring-1 focus:ring-primary h-12 placeholder:text-[#45a1a1] p-3 text-base"
                    required
                  />
                </label>
              </div>

              <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm grid grid-cols-2 gap-4">
                <label className="flex flex-col">
                  <p className="text-[#0c1d1d] dark:text-gray-300 text-sm font-medium pb-2">Start Date</p>
                  <div className="relative">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="form-input w-full rounded-lg text-[#0c1d1d] dark:text-white border border-[#cdeaea] dark:border-gray-700 bg-transparent h-12 p-3 text-sm"
                      required
                    />
                    <span className="material-symbols-outlined absolute right-3 top-3 text-primary text-xl pointer-events-none">calendar_today</span>
                  </div>
                </label>
                <label className="flex flex-col">
                  <p className="text-[#0c1d1d] dark:text-gray-300 text-sm font-medium pb-2">Start Time</p>
                  <div className="relative">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="form-input w-full rounded-lg text-[#0c1d1d] dark:text-white border border-[#cdeaea] dark:border-gray-700 bg-transparent h-12 p-3 text-sm"
                      required
                    />
                    <span className="material-symbols-outlined absolute right-3 top-3 text-primary text-xl pointer-events-none">schedule</span>
                  </div>
                </label>
              </div>

              <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <label className="flex flex-col w-full">
                  <p className="text-[#0c1d1d] dark:text-gray-300 text-sm font-medium pb-2">Venue</p>
                  <select
                    value={venueId}
                    onChange={(e) => setVenueId(e.target.value)}
                    className="form-select w-full rounded-lg text-[#0c1d1d] dark:text-white border border-[#cdeaea] dark:border-gray-700 bg-transparent h-12 px-3 text-base focus:border-primary focus:ring-1 focus:ring-primary"
                    required
                  >
                    {venues.length === 0 ? (
                      <option value="">No venues available</option>
                    ) : (
                      venues.map((venue) => (
                        <option key={venue.id} value={venue.id}>
                          {venue.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
            </div>
          </section>

          {/* Section: Policies */}
          <section className="mt-8">
            <h2 className="text-[#0c1d1d] dark:text-gray-100 text-[20px] font-bold px-4 mb-4">Policies & Access</h2>
            <div className="px-4 space-y-4">
              <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-[#0c1d1d] dark:text-gray-100 font-semibold">21+ Entry Only</p>
                    <p className="text-xs text-gray-500">Strict ID check at the door</p>
                  </div>
                  <label className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ageRestriction21}
                      onChange={(e) => setAgeRestriction21(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full peer peer-checked:bg-primary ${ageRestriction21 ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ageRestriction21 ? 'translate-x-6' : 'translate-x-1'}`}></span>
                    </div>
                  </label>
                </div>
                <div className="border-t border-gray-50 dark:border-gray-800 my-3"></div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-[#0c1d1d] dark:text-gray-100 font-semibold">Guestlist Enabled</p>
                    <p className="text-xs text-gray-500">Allow staff to add custom guests</p>
                  </div>
                  <label className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={guestlistEnabled}
                      onChange={(e) => setGuestlistEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full peer peer-checked:bg-primary ${guestlistEnabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${guestlistEnabled ? 'translate-x-6' : 'translate-x-1'}`}></span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </section>
        </form>
      </main>

      {/* Persistent Bottom Action */}
      <footer className="fixed bottom-20 lg:bottom-0 inset-x-0 p-4 bg-background-light dark:bg-background-dark/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-50 left-1/2 -translate-x-1/2 w-full max-w-[430px] lg:max-w-6xl 2xl:max-w-7xl">
        <button
          onClick={handleSubmit}
          disabled={loading || !title.trim() || !startDate || !startTime || !venueId}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit Request
          <span className="material-symbols-outlined text-xl">send</span>
        </button>
        <p className="text-[10px] text-center text-gray-400 mt-2 uppercase tracking-widest font-bold">Step 1 of 3: General Information</p>
      </footer>
    </PageContainer>
  );
}
