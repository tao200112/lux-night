/**
 * Event Edit Page
 * 商家编辑活动页面
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Event {
  id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  venue_id: string;
  poster_url?: string;
  age_policy?: string;
  refund_policy?: string;
  status: string;
}

interface PendingRequest {
  id: string;
  status: string;
  submitted_at: string;
}

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [agePolicy, setAgePolicy] = useState('21+');
  const [refundPolicy, setRefundPolicy] = useState('no_refund');

  useEffect(() => {
    if (eventId) {
      loadEvent();
      checkPendingRequest();
    }
  }, [eventId]);

  const loadEvent = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/events/${eventId}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Event not found or you do not have access');
        }
        throw new Error('Failed to load event');
      }

      const data = await res.json();
      const eventData = data.event;

      setEvent(eventData);
      setTitle(eventData.title || '');
      setDescription(eventData.description || '');
      setStartAt(eventData.start_at ? new Date(eventData.start_at).toISOString().slice(0, 16) : '');
      setEndAt(eventData.end_at ? new Date(eventData.end_at).toISOString().slice(0, 16) : '');
      setPosterUrl(eventData.poster_url || '');
      setAgePolicy(eventData.age_policy || '21+');
      setRefundPolicy(eventData.refund_policy || 'no_refund');
    } catch (err: any) {
      console.error('Error loading event:', err);
      setError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const checkPendingRequest = async () => {
    try {
      const res = await fetch(`/api/merchant/event-change-requests?event_id=${eventId}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        const pending = data.requests?.find((r: any) => r.status === 'pending');
        if (pending) {
          setPendingRequest(pending);
        }
      }
    } catch (err) {
      // Ignore errors for pending request check
      console.warn('Failed to check pending request:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!event) return;

    try {
      setSubmitting(true);
      setError(null);

      // 构建修改内容
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        poster_url: posterUrl.trim() || null,
        age_policy: agePolicy,
        refund_policy: refundPolicy,
      };

      const res = await fetch('/api/merchant/event-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event_id: eventId,
          payload_json: payload,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to submit change request');
      }

      const data = await res.json();
      
      // 显示成功消息并重定向
      alert('Change request submitted successfully. Waiting for admin approval.');
      router.push(`/events/${eventId}`);
    } catch (err: any) {
      console.error('Error submitting change request:', err);
      setError(err.message || 'Failed to submit change request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark p-8 flex flex-col items-center justify-center">
        <p className="text-alert-red text-center mb-4">{error}</p>
        <button
          onClick={() => router.push('/events')}
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          Back to Events
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between p-4 h-16">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="material-symbols-outlined text-gray-900 dark:text-white cursor-pointer"
            >
              arrow_back
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold leading-none">Edit Event</h1>
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Merchant Portal</span>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 pb-24">
        {pendingRequest && (
          <div className="mb-4 p-4 bg-warning/10 border border-warning/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-warning">info</span>
              <p className="text-sm font-bold text-warning">Pending Approval</p>
            </div>
            <p className="text-xs text-warning/90">
              You have a pending change request submitted on {new Date(pendingRequest.submitted_at).toLocaleDateString()}. 
              Please wait for admin approval before submitting new changes.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-alert-red/10 border border-alert-red/20 rounded-xl">
            <p className="text-sm text-alert-red">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
              Event Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Enter event title"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Enter event description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
                Start Date & Time *
              </label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
                End Date & Time *
              </label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
              Poster URL
            </label>
            <input
              type="url"
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="https://example.com/poster.jpg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
                Age Policy
              </label>
              <select
                value={agePolicy}
                onChange={(e) => setAgePolicy(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="18+">18+</option>
                <option value="21+">21+</option>
                <option value="all_ages">All Ages</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
                Refund Policy
              </label>
              <select
                value={refundPolicy}
                onChange={(e) => setRefundPolicy(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="no_refund">No Refund</option>
                <option value="full_refund">Full Refund</option>
                <option value="partial_refund">Partial Refund</option>
              </select>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting || !!pendingRequest}
              className="w-full h-14 bg-primary text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
            >
              {submitting ? 'Submitting...' : pendingRequest ? 'Pending Approval' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
