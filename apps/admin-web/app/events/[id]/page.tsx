/**
 * Admin Event Detail Page
 * 管理员事件详情页面
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface EventDetail {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: string;
  startAt: string;
  endAt: string;
  posterUrl: string | null;
  merchant: {
    id: string;
    name: string;
  };
  venue: {
    id: string;
    name: string;
    address: string | null;
  } | null;
  region: {
    id: string;
    name: string;
    state: string | null;
    country: string | null;
  };
  ticketTypes: Array<{
    id: string;
    name: string;
    description: string | null;
    category: string;
    priceCents: number;
    inventoryLimit: number | null;
    soldCount: number;
    status: string;
  }>;
  stats: {
    totalOrders: number;
    totalRevenue: number;
    redeemedTickets: number;
  };
}

export default function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string>('');
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve params
  useEffect(() => {
    async function resolveParams() {
      const resolved = await params;
      setEventId(resolved.id);
    }
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (!eventId) return;

    async function fetchEvent() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/admin/events/${eventId}`);
        
        if (!res.ok) {
          const errorText = await res.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: `HTTP ${res.status}` };
          }
          throw new Error(errorData.message || errorData.error?.message || 'Failed to load event');
        }

        const data = await res.json();
        
        if (!data.success || !data.data) {
          throw new Error(data.error?.message || 'Event not found');
        }

        setEvent(data.data);
      } catch (err: any) {
        console.error('[AdminEventDetailPage] Error:', err);
        setError(err.message || 'Failed to load event');
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [eventId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Event Details" showBack />
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-32">
          <SkeletonList count={5} />
        </main>
        <AdminBottomNav />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Event Details" showBack />
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-32">
          <ErrorState
            title="Failed to load event"
            message={error || 'Event not found'}
            actionLabel="Back to Events"
            onAction={() => router.push('/events')}
          />
        </main>
        <AdminBottomNav />
      </div>
    );
  }

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <AdminTopBar title="Event Details" showBack />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-32">
        {/* Event Header */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {event.title}
              </h1>
              {event.subtitle && (
                <p className="text-slate-600 dark:text-slate-300 mb-2">{event.subtitle}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  event.status === 'published' 
                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    : event.status === 'draft'
                    ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}>
                  {event.status.toUpperCase()}
                </span>
              </div>
            </div>
            {event.posterUrl && (
              <img
                src={event.posterUrl}
                alt={event.title}
                className="w-32 h-32 object-cover rounded-lg ml-4"
              />
            )}
          </div>

          {event.description && (
            <p className="text-slate-600 dark:text-slate-300 mt-4 whitespace-pre-wrap">
              {event.description}
            </p>
          )}
        </div>

        {/* Event Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Event Information</h2>
          
          <div className="space-y-3">
            <div className="flex items-start">
              <span className="material-symbols-outlined text-slate-400 mr-3 mt-0.5">schedule</span>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Start Time</p>
                <p className="text-slate-900 dark:text-white">{formatDate(event.startAt)}</p>
              </div>
            </div>
            
            <div className="flex items-start">
              <span className="material-symbols-outlined text-slate-400 mr-3 mt-0.5">event</span>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">End Time</p>
                <p className="text-slate-900 dark:text-white">{formatDate(event.endAt)}</p>
              </div>
            </div>

            {event.venue && (
              <div className="flex items-start">
                <span className="material-symbols-outlined text-slate-400 mr-3 mt-0.5">location_on</span>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Venue</p>
                  <p className="text-slate-900 dark:text-white">{event.venue.name}</p>
                  {event.venue.address && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">{event.venue.address}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-start">
              <span className="material-symbols-outlined text-slate-400 mr-3 mt-0.5">public</span>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Region</p>
                <p className="text-slate-900 dark:text-white">
                  {event.region.name}
                  {event.region.state && `, ${event.region.state}`}
                  {event.region.country && `, ${event.region.country}`}
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <span className="material-symbols-outlined text-slate-400 mr-3 mt-0.5">store</span>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Merchant</p>
                <p className="text-slate-900 dark:text-white">{event.merchant.name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Statistics</h2>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{event.stats.totalOrders}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Orders</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatPrice(event.stats.totalRevenue)}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Revenue</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{event.stats.redeemedTickets}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Redeemed Tickets</p>
            </div>
          </div>
        </div>

        {/* Ticket Types */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Ticket Types</h2>
          
          {event.ticketTypes.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-4">No ticket types</p>
          ) : (
            <div className="space-y-3">
              {event.ticketTypes.map((ticketType) => (
                <div
                  key={ticketType.id}
                  className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{ticketType.name}</h3>
                      {ticketType.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                          {ticketType.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {formatPrice(ticketType.priceCents)}
                      </p>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticketType.status === 'ACTIVE'
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                      }`}>
                        {ticketType.status}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>Category: {ticketType.category}</span>
                    {ticketType.inventoryLimit !== null && (
                      <span>
                        Sold: {ticketType.soldCount} / {ticketType.inventoryLimit}
                      </span>
                    )}
                    {ticketType.inventoryLimit === null && (
                      <span>Sold: {ticketType.soldCount}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href={`/events/${event.id}/edit`}
            className="flex-1 px-4 py-3 bg-primary text-white rounded-lg font-medium text-center hover:bg-primary-hover transition-colors"
          >
            Edit Event
          </Link>
          <Link
            href="/events"
            className="px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium text-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Back to Events
          </Link>
        </div>
      </main>

      <AdminBottomNav />
    </div>
  );
}
