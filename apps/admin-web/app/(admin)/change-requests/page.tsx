/**
 * Admin Change Requests Page
 * 审批修改申请页面
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageContainer from '@/components/admin/PageContainer';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface ChangeRequest {
  id: string;
  merchant_id: string;
  event_id: string;
  target_week_start_date: string;
  payload: any;
  before_snapshot?: any;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by_admin: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  events_v2: {
    id: string;
    title: string;
    merchant_id: string;
  };
  merchants: {
    id: string;
    name: string;
  };
}

function WeekConfigDiff({ before, after }: { before: any; after: any }) {
  const beforeDays = before?.days || {};
  const afterDays = after?.days || {};
  const allDows = new Set([...Object.keys(beforeDays), ...Object.keys(afterDays)]);
  const sortedDows = Array.from(allDows).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-3 text-sm">
      {sortedDows.map((dow) => {
        const b = beforeDays[String(dow)];
        const a = afterDays[String(dow)];
        const dayName = DAY_NAMES[dow];
        const enabledB = b?.enabled ?? false;
        const enabledA = a?.enabled ?? false;
        const timeB = b ? `${b.start_time}-${b.end_time}${b.end_next_day ? ' (next day)' : ''}` : '—';
        const timeA = a ? `${a.start_time}-${a.end_time}${a.end_next_day ? ' (next day)' : ''}` : '—';
        const ticketsB = (b?.tickets || []).filter((t: any) => t.action !== 'delete');
        const ticketsA = (a?.tickets || []).filter((t: any) => t.action !== 'delete');

        const hasEnabledChange = enabledB !== enabledA;
        const hasTimeChange = timeB !== timeA;
        const ticketDiffs: { name: string; change: string }[] = [];

        const byId = (arr: any[]) => {
          const m: Record<string, any> = {};
          (arr || []).forEach((t) => {
            if (t.id) m[t.id] = t;
            else m[`new-${t.name}-${t.category}`] = t;
          });
          return m;
        };
        const beforeById = byId(ticketsB);
        const afterById = byId(ticketsA);
        const allIds = new Set([...Object.keys(beforeById), ...Object.keys(afterById)]);

        allIds.forEach((id) => {
          const tb = beforeById[id];
          const ta = afterById[id];
          if (!ta) ticketDiffs.push({ name: tb?.name || id, change: 'Deleted' });
          else if (!tb) ticketDiffs.push({ name: ta.name || 'New', change: 'Added' });
          else {
            const parts: string[] = [];
            if (tb.price_cents !== ta.price_cents) parts.push(`$${(tb.price_cents/100).toFixed(2)} → $${(ta.price_cents/100).toFixed(2)}`);
            if (tb.inventory_limit !== ta.inventory_limit) parts.push(`Limit: ${tb.inventory_limit ?? '—'} → ${ta.inventory_limit ?? '—'}`);
            if (tb.name !== ta.name) parts.push(`"${tb.name}" → "${ta.name}"`);
            if (tb.status !== ta.status) parts.push(`Status: ${tb.status} → ${ta.status}`);
            if (parts.length) ticketDiffs.push({ name: ta.name, change: parts.join('; ') });
          }
        });

        const hasChanges = hasEnabledChange || hasTimeChange || ticketDiffs.length > 0;
        if (!hasChanges) return null;

        return (
          <div key={dow} className="rounded-lg border border-gray-600 p-3 bg-background-dark/50">
            <h4 className="font-semibold text-white mb-2">{dayName}</h4>
            <div className="space-y-1 text-gray-300">
              {hasEnabledChange && (
                <p>Enabled: <span className="text-red-400">{enabledB ? 'Yes' : 'No'}</span> → <span className="text-green-400">{enabledA ? 'Yes' : 'No'}</span></p>
              )}
              {hasTimeChange && (
                <p>Time: <span className="text-red-400">{timeB}</span> → <span className="text-green-400">{timeA}</span></p>
              )}
              {ticketDiffs.map((d, i) => (
                <p key={i}><span className="font-medium">{d.name}:</span> {d.change}</p>
              ))}
            </div>
          </div>
        );
      })}
      {sortedDows.length === 0 && (
        <p className="text-gray-400">No day-level changes (raw payload only)</p>
      )}
    </div>
  );
}

export default function AdminChangeRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter === 'pending') {
        params.set('status', 'pending');
      }

      const response = await fetch(`/api/admin/change-requests?${params.toString()}`);
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Sort: pending first
      const sorted = (result.requests || []).sort((a: ChangeRequest, b: ChangeRequest) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setRequests(sorted);
    } catch (err: any) {
      console.error('[ADMIN CHANGE REQUESTS] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      setProcessing(true);
      setError(null);

      const response = await fetch(`/api/admin/change-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_note: reviewNote || null,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setSelectedRequest(null);
      setReviewNote('');
      await fetchRequests();
      alert('Change request approved successfully!');
    } catch (err: any) {
      console.error('[ADMIN CHANGE REQUESTS] Approve error:', err);
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      setProcessing(true);
      setError(null);

      const response = await fetch(`/api/admin/change-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_note: reviewNote || null,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setSelectedRequest(null);
      setReviewNote('');
      await fetchRequests();
      alert('Change request rejected.');
    } catch (err: any) {
      console.error('[ADMIN CHANGE REQUESTS] Reject error:', err);
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <PageContainer fullBleed className="bg-background-dark text-white">
        <div className="max-w-7xl mx-auto py-8">
          <div className="animate-pulse">Loading change requests...</div>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer fullBleed className="bg-background-dark text-white">
        <div className="max-w-7xl mx-auto py-8">
          <div className="text-red-400">{error}</div>
          <button
            onClick={fetchRequests}
            className="mt-4 px-4 py-2 bg-primary text-black rounded-lg"
          >
            Retry
          </button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer fullBleed className="bg-background-dark text-white">
      <div className="max-w-7xl mx-auto py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Change Requests</h1>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-lg transition ${
              statusFilter === 'pending'
                ? 'bg-primary text-black'
                : 'bg-surface-dark text-white hover:bg-surface-light'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg transition ${
              statusFilter === 'all'
                ? 'bg-primary text-black'
                : 'bg-surface-dark text-white hover:bg-surface-light'
            }`}
          >
            All
          </button>
        </div>

        {/* Requests List */}
        {requests.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No change requests found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-surface-dark rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">
                      {request.events_v2?.title || 'Unknown Event'}
                    </h3>
                    <div className="text-sm text-gray-400 space-y-1">
                      <p>Merchant: {request.merchants?.name || 'Unknown'}</p>
                      <p>
                        Target Week: {new Date(request.target_week_start_date).toLocaleDateString()}
                      </p>
                      <p>Submitted: {new Date(request.created_at).toLocaleString()}</p>
                      {request.note && <p>Note: {request.note}</p>}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      request.status === 'pending'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : request.status === 'approved'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {request.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedRequest(request)}
                    className="px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary-hover transition"
                  >
                    View Details
                  </button>
                  {request.status === 'pending' && (
                    <button
                      onClick={() => {
                        setSelectedRequest(request);
                        setReviewNote('');
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition"
                    >
                      Review & Approve
                    </button>
                  )}
                </div>

                {/* Review Info */}
                {request.status !== 'pending' && request.review_note && (
                  <div className="mt-4 text-sm text-gray-400">
                    <p>
                      {request.status === 'approved' ? 'Approved' : 'Rejected'} by admin on{' '}
                      {request.reviewed_at
                        ? new Date(request.reviewed_at).toLocaleString()
                        : 'N/A'}
                    </p>
                    <p className="mt-1">Note: {request.review_note}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Review Modal */}
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-surface-dark rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Review Change Request</h2>

              <div className="mb-4 space-y-2 text-sm">
                <p>
                  <strong>Event:</strong> {selectedRequest.events_v2?.title}
                </p>
                <p>
                  <strong>Merchant:</strong> {selectedRequest.merchants?.name}
                </p>
                <p>
                  <strong>Target Week:</strong>{' '}
                  {new Date(selectedRequest.target_week_start_date).toLocaleDateString()}
                </p>
                {selectedRequest.note && (
                  <p>
                    <strong>Merchant Note:</strong> {selectedRequest.note}
                  </p>
                )}
              </div>

              <div className="mb-4">
                <h3 className="text-sm font-bold text-white mb-2">Change Summary</h3>
                {selectedRequest.payload?.days ? (
                  <WeekConfigDiff
                    before={selectedRequest.before_snapshot || {}}
                    after={selectedRequest.payload}
                  />
                ) : (
                  <pre className="p-3 bg-background-dark rounded text-xs overflow-auto max-h-64 text-gray-300">
                    {JSON.stringify(selectedRequest.payload, null, 2)}
                  </pre>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Review Note (optional)</label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="w-full px-4 py-2 bg-background-dark rounded-lg border border-gray-700 text-white"
                  rows={3}
                  placeholder="Optional note for the merchant..."
                />
              </div>

              {error && (
                <div className="mb-4 bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => handleApprove(selectedRequest.id)}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleReject(selectedRequest.id)}
                  disabled={processing}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Reject'}
                </button>
                <button
                  onClick={() => {
                    setSelectedRequest(null);
                    setReviewNote('');
                    setError(null);
                  }}
                  className="px-6 py-3 bg-surface-light rounded-lg hover:bg-surface-light/80 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
