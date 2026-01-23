/**
 * Event Detail Page
 * 完全按照 uimerchant/merchant__event_detail/code.html 设计
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useMerchantContext } from '@/contexts/MerchantContext';

interface EventDetail {
  id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  venue: {
    id: string;
    name: string;
    address?: string;
  };
  status: string;
  poster_url?: string;
  total_revenue?: number;
  tickets_sold?: number;
  tickets_total?: number;
  checkins_count?: number;
  ticket_types?: Array<{
    id: string;
    name: string;
    price_cents: number;
    quantity_available: number;
    quantity_sold: number;
  }>;
}

interface ChangeRequest {
  id: string;
  request_type: 'poster' | 'price' | 'inventory';
  status: 'pending' | 'approved' | 'rejected';
  payload_json: any;
  submitted_at: string;
  approved_at?: string | null;
  rejected_reason?: string | null;
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;
  const { workspace } = useMerchantContext();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [posterFile, setPosterFile] = useState<File | null>(null);

  useEffect(() => {
    if (eventId) {
      loadEventDetail();
      loadChangeRequests();
    }
  }, [eventId]);

  const loadEventDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      // 使用统一的 merchant events API
      const res = await fetch(`/api/merchant/events/${eventId}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Event not found or you do not have access');
        }
        throw new Error('Failed to load event');
      }

      const data = await res.json();
      setEvent(data.event);
    } catch (err: any) {
      console.error('Error loading event:', err);
      setError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const loadChangeRequests = async () => {
    try {
      const res = await fetch(`/api/merchant/event-change-requests?event_id=${eventId}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setChangeRequests(data.requests || []);
        }
      }
    } catch (err) {
      console.error('Error loading change requests:', err);
    }
  };

  const handlePosterFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPosterFile(file);
      handlePosterUpload(file);
    }
  };

  const handlePosterUpload = async (file: File) => {
    try {
      setUploadingPoster(true);

      // 先上传图片
      const formData = new FormData();
      formData.append('file', file);
      formData.append('event_id', eventId);

      const uploadRes = await fetch('/api/merchant/upload-poster', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.error?.message || 'Failed to upload poster');
      }

      // 创建 poster change request
      const requestRes = await fetch('/api/merchant/event-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event_id: eventId,
          request_type: 'poster',
          payload_json: {
            poster_url: uploadData.poster_url,
          },
        }),
      });

      const requestData = await requestRes.json();

      if (!requestRes.ok || !requestData.success) {
        throw new Error(requestData.error?.message || 'Failed to create change request');
      }

      // 添加到状态栏顶部
      setChangeRequests((prev) => [requestData.request, ...prev]);

      // 显示 toast
      alert(`Submitted (Pending Approval)\nRequest ID: ${requestData.request.id}`);

      // 重新加载事件详情（更新海报预览）
      await loadEventDetail();
    } catch (err: any) {
      console.error('Error uploading poster:', err);
      alert(`Failed to upload poster: ${err.message}`);
    } finally {
      setUploadingPoster(false);
      setPosterFile(null);
    }
  };

  const getRequestSummary = (request: ChangeRequest): string => {
    const payload = request.payload_json;
    if (request.request_type === 'price') {
      const ticketTypeName = payload.ticket_type_name || 'Ticket';
      const oldPrice = payload.old_price ? `$${(payload.old_price / 100).toFixed(2)}` : '';
      const newPrice = payload.new_price ? `$${(payload.new_price / 100).toFixed(2)}` : '';
      return `${ticketTypeName} ${oldPrice} → ${newPrice}`;
    } else if (request.request_type === 'inventory') {
      const ticketTypeName = payload.ticket_type_name || 'Ticket';
      const oldCapacity = payload.old_capacity || '';
      const newCapacity = payload.new_capacity || '';
      return `${ticketTypeName} Capacity: ${oldCapacity} → ${newCapacity}`;
    } else if (request.request_type === 'poster') {
      return 'Poster image change';
    }
    return 'Change request';
  };

  const getRequestTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      poster: 'Poster',
      price: 'Price',
      inventory: 'Inventory',
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200',
      approved: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200',
      rejected: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200',
    };
    return colors[status] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200';
  };

  if (loading) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="w-full max-w-[430px] mx-auto min-h-screen bg-background-light dark:bg-background-dark p-8 flex flex-col items-center justify-center">
        <p className="text-alert-red text-center mb-4">{error || 'Event not found'}</p>
        <button
          onClick={() => router.push('/events')}
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          Back to Events
        </button>
      </div>
    );
  }

  // 根据时间判断是否 live
  const now = new Date();
  const startAt = new Date(event.start_at);
  const endAt = new Date(event.end_at);
  const isLive = startAt <= now && endAt >= now;
  const checkInRate = event.tickets_sold ? (event.checkins_count || 0) / event.tickets_sold : 0;

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-white antialiased min-h-screen pb-48">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between p-4 h-16">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="material-symbols-outlined text-[#0c1d1d] dark:text-white cursor-pointer"
            >
              arrow_back
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold leading-none">Event Detail</h1>
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Merchant Portal</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLive && (
              <>
                <span className="flex h-2 w-2 rounded-full bg-success animate-pulse"></span>
                <span className="text-xs font-medium text-success">Live</span>
              </>
            )}
            <Link
              href={`/events/${eventId}/edit`}
              className="ml-2 text-[#0c1d1d] dark:text-white hover:text-primary transition"
            >
              <span className="material-symbols-outlined">edit</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto pb-48">
        {/* Event Header */}
        <div className="p-4 flex gap-4 items-center">
          <div className="relative w-20 h-20 rounded-xl bg-gray-300 dark:bg-gray-700 shrink-0 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-center group">
            {event.poster_url ? (
              <img alt={event.title} className="w-full h-full object-cover rounded-xl" src={event.poster_url} />
            ) : (
              <span className="material-symbols-outlined text-gray-400 text-4xl">event</span>
            )}
            {/* Change Poster Button */}
            <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-xl cursor-pointer transition-opacity">
              <input
                type="file"
                accept="image/*"
                onChange={handlePosterFileSelect}
                className="hidden"
                disabled={uploadingPoster}
              />
              {uploadingPoster ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              ) : (
                <span className="material-symbols-outlined text-white text-2xl">edit</span>
              )}
            </label>
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tight">{event.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(event.start_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} • {new Date(event.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
            <div className="flex items-center gap-1 mt-1 text-xs text-primary font-medium">
              <span className="material-symbols-outlined text-xs">location_on</span>
              <span>{event.venue?.name || 'Unknown Venue'}</span>
            </div>
          </div>
        </div>

        {/* Critical Alert (if needed) */}
        {event.ticket_types && event.ticket_types.some(tt => (tt.quantity_sold / (tt.quantity_available + tt.quantity_sold)) > 0.9) && (
          <div className="mx-4 mb-4 p-3 bg-warning/10 border border-warning/20 rounded-xl flex items-center gap-3">
            <span className="material-symbols-outlined text-warning text-xl">error</span>
            <div className="flex-1">
              <p className="text-xs font-bold text-warning uppercase tracking-tight">Critical Alert</p>
              <p className="text-sm text-warning/90 font-medium text-[13px]">Some ticket types are below 10% inventory.</p>
            </div>
            <button className="text-xs font-bold text-warning underline">Manage</button>
          </div>
        )}

        {/* Revenue & Stats Grid */}
        <div className="grid grid-cols-2 gap-3 px-4 mb-6">
          <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-gray-800 col-span-2">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Revenue</span>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold tracking-tight text-primary">
                    ${((event.total_revenue || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full flex items-center">
                    <span className="material-symbols-outlined text-[10px]">trending_up</span> 12%
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">Updated 2m ago</span>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">Tickets Sold</span>
            <span className="text-xl font-bold tracking-tight">
              {event.tickets_sold || 0} <span className="text-gray-300 dark:text-gray-600 font-normal">/ {event.tickets_total || 0}</span>
            </span>
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full" 
                style={{ width: `${event.tickets_total ? ((event.tickets_sold || 0) / event.tickets_total) * 100 : 0}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">Check-ins</span>
            <span className="text-xl font-bold tracking-tight">
              {event.checkins_count || 0} <span className="text-gray-400 dark:text-gray-500 text-sm font-medium">({Math.round(checkInRate * 100)}%)</span>
            </span>
            <div className="flex gap-1 mt-3">
              <div className="flex-1 h-1 bg-primary rounded-full" style={{ width: `${checkInRate * 100}%` }}></div>
              <div className="flex-1 h-1 bg-primary/20 rounded-full"></div>
              <div className="flex-1 h-1 bg-primary/20 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Change Requests Status Bar */}
        {changeRequests.length > 0 && (
          <section className="mb-6">
            <div className="px-4 flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.1em]">Change Requests</h3>
              {changeRequests.length > 3 && (
                <button
                  onClick={() => setShowAllRequests(!showAllRequests)}
                  className="text-xs text-primary font-medium"
                >
                  {showAllRequests ? 'Show Less' : `View All (${changeRequests.length})`}
                </button>
              )}
            </div>
            <div className="mx-4 space-y-2">
              {(showAllRequests ? changeRequests : changeRequests.slice(0, 3)).map((request) => (
                <div
                  key={request.id}
                  className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColor(request.status)}`}>
                        {request.status.toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        {getRequestTypeLabel(request.request_type)}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(request.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">
                    {getRequestSummary(request)}
                  </p>
                  {request.approved_at && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Approved: {new Date(request.approved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })}
                    </p>
                  )}
                  {request.rejected_reason && (
                    <p className="text-[10px] text-red-600 dark:text-red-400">
                      Rejected: {request.rejected_reason}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                    ID: {request.id.slice(0, 8)}...
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ticket Types Section */}
        <section className="mb-6">
          <div className="px-4 flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.1em]">Ticket Types & Inventory</h3>
          </div>
          <div className="mx-4 mb-4 p-3 bg-info/10 border border-info/20 rounded-xl flex items-center gap-3">
            <span className="material-symbols-outlined text-info text-xl">info</span>
            <p className="text-[13px] text-info font-medium leading-tight">Price changes only affect future purchases.</p>
          </div>

          <div className="flex flex-col">
            {event.ticket_types && event.ticket_types.length > 0 ? (
              event.ticket_types.map((tt) => {
                const soldRate = (tt.quantity_sold / (tt.quantity_available + tt.quantity_sold)) || 0;
                const isSoldOut = soldRate >= 1;
                const isLowStock = soldRate > 0.9;

                return (
                  <div
                    key={tt.id}
                    className={`flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800 ${isLowStock ? 'bg-warning/5' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`size-10 flex items-center justify-center rounded-lg ${isLowStock ? 'bg-warning/10' : 'bg-primary/10'}`}>
                        <span className={`material-symbols-outlined ${isLowStock ? 'text-warning' : 'text-primary'}`}>
                          {isSoldOut ? 'confirmation_number' : 'stars'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{tt.name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-900 dark:text-white font-semibold">${(tt.price_cents / 100).toFixed(2)}</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-500">{tt.quantity_sold} / {tt.quantity_available + tt.quantity_sold} Units</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSoldOut
                            ? 'bg-success/10 text-success'
                            : isLowStock
                            ? 'bg-warning/10 text-warning'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                        }`}
                      >
                        {isSoldOut ? 'SOLD OUT' : isLowStock ? `${Math.round(soldRate * 100)}% SOLD` : 'OPEN'}
                      </span>
                      <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${isSoldOut ? 'bg-success' : isLowStock ? 'bg-warning' : 'bg-primary/20'}`}
                          style={{ width: `${soldRate * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No ticket types available</div>
            )}
          </div>

          <div className="p-4 grid grid-cols-2 gap-3">
            <Link
              href={`/requests/price-change?event_id=${eventId}`}
              className="flex items-center justify-center gap-2 py-3 px-2 border border-primary/30 rounded-xl text-primary text-xs font-bold active:bg-primary/5"
            >
              <span className="material-symbols-outlined text-lg">payments</span>
              Request Price Change
            </Link>
            <Link
              href={`/requests/inventory-change?event_id=${eventId}`}
              className="flex items-center justify-center gap-2 py-3 px-2 border border-primary/30 rounded-xl text-primary text-xs font-bold active:bg-primary/5"
            >
              <span className="material-symbols-outlined text-lg">inventory_2</span>
              Request Inventory Change
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
