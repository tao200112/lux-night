/**
 * Admin Edit Event Page
 * 管理员编辑活动页面
 * 基于创建页面，但加载现有事件数据
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminButton from '@/components/admin/AdminButton';

interface Venue {
  id: string;
  name: string;
  address: string | null;
  logo_url: string | null;
  description: string | null;
  region_id?: string | null;
  region?: {
    id: string;
    name: string;
  } | null;
  merchant: {
    id: string;
    name: string;
  };
}

interface TicketType {
  id?: string;
  name: string;
  description: string;
  category: 'ENTRY' | 'DRINK' | 'VIP' | 'SKIP_LINE';
  price_cents: number;
  quantity_total: number | null;
  max_per_order: number;
  age_requirement: 'NONE' | '18_PLUS' | '21_PLUS';
  sales_start_at: string | null;
  sales_end_at: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'HIDDEN';
  sort_order: number;
  redeem_limit: number;
  redeem_start_at_override: string | null;
  redeem_end_at_override: string | null;
}

export default function AdminEditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loadingVenue, setLoadingVenue] = useState(true);
  const [hasDefaultVenue, setHasDefaultVenue] = useState<boolean | null>(null);
  const [merchantName, setMerchantName] = useState<string>('');
  const [merchantId, setMerchantId] = useState<string>('');

  // Section 1: Poster + Title
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');

  // Section 2: Venue
  const [venueId, setVenueId] = useState<string>('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  // Section 3: Event Time
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  // Section 4: Redeem Window
  const [redeemStartDate, setRedeemStartDate] = useState('');
  const [redeemStartTime, setRedeemStartTime] = useState('');
  const [redeemEndDate, setRedeemEndDate] = useState('');
  const [redeemEndTime, setRedeemEndTime] = useState('');

  // Section 5: Ticket Types
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [editingTicketType, setEditingTicketType] = useState<TicketType | null>(null);
  const [showTicketTypeModal, setShowTicketTypeModal] = useState(false);

  // Section 6: Policies
  const [refundPolicy, setRefundPolicy] = useState<'no_refund' | '24h' | 'flexible' | 'venue_policy' | 'UNTIL_START' | 'CUSTOM'>('no_refund');

  // Resolve params
  useEffect(() => {
    async function resolveParams() {
      const resolved = await params;
      setEventId(resolved.id);
    }
    resolveParams();
  }, [params]);

  // Load event data
  useEffect(() => {
    if (!eventId) return;

    async function loadEvent() {
      try {
        setLoading(true);
        setLoadingVenue(true);

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

        const event = data.data;
        
        // Set merchant info
        if (event.merchant) {
          setMerchantId(event.merchant.id);
          setMerchantName(event.merchant.name);
        }

        // Set basic info
        setTitle(event.title || '');
        setSubtitle(event.subtitle || '');
        setDescription(event.description || '');
        setPosterUrl(event.posterUrl);
        if (event.posterUrl) {
          setPosterPreview(event.posterUrl);
        }

        // Set venue
        if (event.venue) {
          setVenueId(event.venue.id);
          setSelectedVenue({
            id: event.venue.id,
            name: event.venue.name,
            address: event.venue.address,
            logo_url: null,
            description: null,
            merchant: event.merchant || { id: '', name: '' },
          });
          setHasDefaultVenue(true);
        }

        // Set dates
        if (event.startAt) {
          const start = new Date(event.startAt);
          setStartDate(start.toISOString().split('T')[0]);
          setStartTime(start.toTimeString().slice(0, 5));
        }
        if (event.endAt) {
          const end = new Date(event.endAt);
          setEndDate(end.toISOString().split('T')[0]);
          setEndTime(end.toTimeString().slice(0, 5));
        }

        // Set ticket types
        if (event.ticketTypes && Array.isArray(event.ticketTypes)) {
          setTicketTypes(event.ticketTypes.map((tt: any) => ({
            id: tt.id,
            name: tt.name || '',
            description: tt.description || '',
            category: tt.category || 'ENTRY',
            price_cents: tt.priceCents || 0,
            quantity_total: tt.inventoryLimit,
            max_per_order: 10,
            age_requirement: 'NONE',
            sales_start_at: null,
            sales_end_at: null,
            status: tt.status || 'DRAFT',
            sort_order: 0,
            redeem_limit: 1,
            redeem_start_at_override: null,
            redeem_end_at_override: null,
          })));
        }

        // Load venues
        if (event.merchant?.id) {
          await loadAllVenues(event.merchant.id);
        }
      } catch (err: any) {
        console.error('[EditEventPage] Error loading event:', err);
        alert(err.message || 'Failed to load event');
        router.push('/events');
      } finally {
        setLoading(false);
        setLoadingVenue(false);
      }
    }

    loadEvent();
  }, [eventId, router]);

  const loadAllVenues = async (merchantIdParam?: string) => {
    const targetMerchantId = merchantIdParam || merchantId;
    if (!targetMerchantId) return;
    
    try {
      const res = await fetch(`/api/admin/venues?merchant_id=${targetMerchantId}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[EditEventPage] Venues API error:', res.status, errorText);
        setVenues([]);
        return;
      }
      
      const data = await res.json();
      
      if (data.success && data.data) {
        setVenues(data.data);
      } else {
        setVenues([]);
      }
    } catch (err) {
      console.error('[EditEventPage] Failed to load venues:', err);
      setVenues([]);
    }
  };

  const handleSaveDraft = async () => {
    if (!eventId) return;

    try {
      setSaving(true);
      setValidationErrors([]);

      // Build time objects
      let startDateTime: Date | null = null;
      let endDateTime: Date | null = null;
      
      if (startDate && startTime) {
        startDateTime = new Date(`${startDate}T${startTime}`);
        if (isNaN(startDateTime.getTime())) {
          startDateTime = null;
        }
      }
      
      if (endDate && endTime) {
        endDateTime = new Date(`${endDate}T${endTime}`);
        if (isNaN(endDateTime.getTime())) {
          endDateTime = null;
        }
      }

      const redeemStart = redeemStartDate && redeemStartTime
        ? new Date(`${redeemStartDate}T${redeemStartTime}`)
        : null;
      const redeemEnd = redeemEndDate && redeemEndTime
        ? new Date(`${redeemEndDate}T${redeemEndTime}`)
        : null;

      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          poster_url: posterUrl || null,
          venue_id: venueId || null,
          start_at: startDateTime?.toISOString() || null,
          end_at: endDateTime?.toISOString() || null,
          redeem_start_at: redeemStart?.toISOString() || null,
          redeem_end_at: redeemEnd?.toISOString() || null,
          refund_policy: refundPolicy,
          published_status: 'DRAFT',
          ticket_types: ticketTypes.map(tt => ({
            ...tt,
            price_cents: tt.price_cents,
            status: tt.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to save draft');
      }

      alert('Draft saved successfully!');
      router.push(`/events/${eventId}`);
    } catch (err: any) {
      console.error('Save draft error:', err);
      alert(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!eventId) return;

    // Validate
    const errors: string[] = [];
    if (!title.trim()) errors.push('Title is required');
    if (!venueId) errors.push('Venue is required');
    if (!startDate || !startTime) errors.push('Start date and time are required');
    if (!endDate || !endTime) errors.push('End date and time are required');
    
    if (startDate && startTime && endDate && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      if (end <= start) {
        errors.push('End time must be after start time');
      }
    }

    const activeTickets = ticketTypes.filter(tt => tt.status === 'ACTIVE');
    if (activeTickets.length === 0) {
      errors.push('At least one active ticket type is required');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    try {
      setPublishing(true);
      setValidationErrors([]);

      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${endDate}T${endTime}`);

      const redeemStart = redeemStartDate && redeemStartTime
        ? new Date(`${redeemStartDate}T${redeemStartTime}`)
        : null;
      const redeemEnd = redeemEndDate && redeemEndTime
        ? new Date(`${redeemEndDate}T${redeemEndTime}`)
        : null;

      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          poster_url: posterUrl || null,
          venue_id: venueId,
          start_at: startDateTime.toISOString(),
          end_at: endDateTime.toISOString(),
          redeem_start_at: redeemStart?.toISOString() || null,
          redeem_end_at: redeemEnd?.toISOString() || null,
          refund_policy: refundPolicy,
          published_status: 'PUBLISHED',
          ticket_types: ticketTypes.map(tt => ({
            ...tt,
            price_cents: tt.price_cents,
            status: tt.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to publish event');
      }

      alert('Event published successfully!');
      router.push(`/events/${eventId}`);
    } catch (err: any) {
      console.error('Publish error:', err);
      alert(err.message || 'Failed to publish event');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark">
        <AdminTopBar title="Edit Event" showBack />
        <main className="flex-1 overflow-y-auto px-4 py-6 pb-32">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-slate-500 dark:text-slate-400">Loading event...</span>
          </div>
        </main>
      </div>
    );
  }

  // 简化版UI - 只显示关键字段，完整UI可以参考new/page.tsx
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <AdminTopBar title="Edit Event" showBack />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-32">
        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-4 bg-alert-red/10 border border-alert-red rounded-lg mb-6">
            <p className="text-alert-red font-semibold mb-2">Please fix the following errors:</p>
            <ul className="list-disc list-inside text-sm text-alert-red space-y-1">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Basic Info */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm mb-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Event Information</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Subtitle (Optional)
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Event subtitle"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your event..."
                rows={4}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-base resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </section>

        {/* Venue */}
        {selectedVenue && (
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Venue</h3>
            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedVenue.name}</p>
              {selectedVenue.address && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedVenue.address}</p>
              )}
            </div>
          </section>
        )}

        {/* Time */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm mb-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Event Time</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                End Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="flex-1 px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving || publishing}
            className="flex-1 px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </main>
    </div>
  );
}
