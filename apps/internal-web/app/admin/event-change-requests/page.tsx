/**
 * Admin Event Change Requests Page
 * 管理员活动修改请求审批页面
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ChangeRequest {
  id: string;
  event_id: string;
  merchant_id: string;
  status: string;
  payload_json: any;
  submitted_at: string;
  approved_at?: string;
  rejection_reason?: string;
  events?: {
    id: string;
    title: string;
    start_at: string;
  };
  merchants?: {
    id: string;
    name: string;
  };
  submitted_user?: {
    id: string;
    email: string;
  };
}

export default function AdminEventChangeRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/admin/event-change-requests?status=${filter}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Admin access required');
        }
        throw new Error('Failed to load change requests');
      }

      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err: any) {
      console.error('Error loading change requests:', err);
      setError(err.message || 'Failed to load change requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!confirm('Are you sure you want to approve this change request? The changes will be applied to the event immediately.')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/event-change-requests/${requestId}/approve`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to approve request');
      }

      alert('Change request approved and applied successfully');
      loadRequests();
    } catch (err: any) {
      console.error('Error approving request:', err);
      alert(`Failed to approve request: ${err.message}`);
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    try {
      const res = await fetch(`/api/admin/event-change-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rejection_reason: reason }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to reject request');
      }

      alert('Change request rejected');
      loadRequests();
    } catch (err: any) {
      console.error('Error rejecting request:', err);
      alert(`Failed to reject request: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark p-8 flex flex-col items-center justify-center">
        <p className="text-alert-red text-center mb-4">{error}</p>
        <button
          onClick={loadRequests}
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          Retry
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
              <h1 className="text-sm font-bold leading-none">Event Change Requests</h1>
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Admin Portal</span>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="px-4 pb-2">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filter === 'pending'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filter === 'approved'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filter === 'rejected'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              Rejected
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 pb-24">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="material-symbols-outlined text-gray-400 text-6xl mb-4">inbox</span>
            <p className="text-gray-500 dark:text-gray-400 text-center">
              No {filter} change requests
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                      {request.events?.title || 'Unknown Event'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Merchant: {request.merchants?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Submitted: {new Date(request.submitted_at).toLocaleString()}
                    </p>
                    {request.submitted_user && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        By: {request.submitted_user.email}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                      request.status === 'pending'
                        ? 'bg-warning/10 text-warning'
                        : request.status === 'approved'
                        ? 'bg-success/10 text-success'
                        : 'bg-alert-red/10 text-alert-red'
                    }`}
                  >
                    {request.status}
                  </span>
                </div>

                {/* Changes Preview */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Changes:</p>
                  <div className="space-y-1 text-sm">
                    {request.payload_json.title && (
                      <p><span className="font-semibold">Title:</span> {request.payload_json.title}</p>
                    )}
                    {request.payload_json.start_at && (
                      <p><span className="font-semibold">Start:</span> {new Date(request.payload_json.start_at).toLocaleString()}</p>
                    )}
                    {request.payload_json.end_at && (
                      <p><span className="font-semibold">End:</span> {new Date(request.payload_json.end_at).toLocaleString()}</p>
                    )}
                    {request.payload_json.age_policy && (
                      <p><span className="font-semibold">Age Policy:</span> {request.payload_json.age_policy}</p>
                    )}
                    {request.payload_json.refund_policy && (
                      <p><span className="font-semibold">Refund Policy:</span> {request.payload_json.refund_policy}</p>
                    )}
                  </div>
                </div>

                {request.rejection_reason && (
                  <div className="bg-alert-red/10 border border-alert-red/20 rounded-lg p-3">
                    <p className="text-xs font-bold text-alert-red uppercase mb-1">Rejection Reason:</p>
                    <p className="text-sm text-alert-red">{request.rejection_reason}</p>
                  </div>
                )}

                {request.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="flex-1 h-10 bg-success text-white rounded-lg font-semibold hover:bg-success/90 transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      className="flex-1 h-10 bg-alert-red text-white rounded-lg font-semibold hover:bg-alert-red/90 transition"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
