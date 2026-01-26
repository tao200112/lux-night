/**
 * Admin Edit Event Page - Complete Version
 * 管理员编辑活动页面（完整版）
 * 功能与创建页面对齐：支持所有字段编辑、海报、票种、状态控制等
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminButton from '@/components/admin/AdminButton';

interface Venue {
  id: string;
  name: string;
  address: string | null;
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
  sold_count?: number; // 已售出数量（用于判断是否可以删除）
}

interface EventStats {
  totalOrders: number;
  totalRevenue: number;
  totalRevenueFormatted: string;
  redeemedTickets: number;
}

function AdminEditEventPageContent({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string; state: string | null; country: string }[]>([]);
  const [regionId, setRegionId] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loadingVenue, setLoadingVenue] = useState(true);
  const [merchantName, setMerchantName] = useState<string>('');
  const [merchantId, setMerchantId] = useState<string>('');
  const [currentStatus, setCurrentStatus] = useState<'draft' | 'published' | 'paused' | 'cancelled'>('draft');
  const [eventStats, setEventStats] = useState<EventStats | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [redeemWindowInitialized, setRedeemWindowInitialized] = useState(false);

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

  // 加载 regions
  useEffect(() => {
    fetch('/api/admin/regions')
      .then((r) => r.json())
      .then((d) => { if (d.success && d.data) setRegions(d.data); })
      .catch(() => {});
  }, []);

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

        // Set status (map database status to UI status)
        const statusMap: Record<string, 'draft' | 'published' | 'paused' | 'cancelled'> = {
          'draft': 'draft',
          'published': 'published',
          'paused': 'paused',
          'cancelled': 'cancelled',
          'pending_review': 'draft',
          'approved': 'draft',
          'rejected': 'draft',
          'archived': 'cancelled',
        };
        setCurrentStatus(statusMap[event.status] || 'draft');

        // Set stats
        if (event.stats) {
          setEventStats(event.stats);
        }

        // Set basic info
        setTitle(event.title || '');
        setSubtitle(event.subtitle || '');
        setDescription(event.description || '');
        setPosterUrl(event.posterUrl);
        if (event.posterUrl) {
          setPosterPreview(event.posterUrl);
        }

        // Set region（event.region?.id 或 venue.region_id，兼容旧数据）
        const rid = event.region?.id || event.venue?.region_id || '';
        setRegionId(rid);

        // Set venue
        if (event.venue) {
          setVenueId(event.venue.id);
          setSelectedVenue({
            id: event.venue.id,
            name: event.venue.name,
            address: event.venue.address,
            region_id: event.region?.id || event.venue?.region_id || null,
            region: event.region || null,
            merchant: event.merchant || { id: '', name: '' },
          });
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

        // Set redeem window
        if (event.redeemStartAt) {
          const redeemStart = new Date(event.redeemStartAt);
          setRedeemStartDate(redeemStart.toISOString().split('T')[0]);
          setRedeemStartTime(redeemStart.toTimeString().slice(0, 5));
          setRedeemWindowInitialized(true);
        }
        if (event.redeemEndAt) {
          const redeemEnd = new Date(event.redeemEndAt);
          setRedeemEndDate(redeemEnd.toISOString().split('T')[0]);
          setRedeemEndTime(redeemEnd.toTimeString().slice(0, 5));
          setRedeemWindowInitialized(true);
        }

        // Set ticket types (priceCents from API is in cents, convert to dollars for display)
        if (event.ticketTypes && Array.isArray(event.ticketTypes)) {
          setTicketTypes(event.ticketTypes.map((tt: any) => ({
            id: tt.id,
            name: tt.name || '',
            description: tt.description || '',
            category: tt.category || 'ENTRY',
            price_cents: (tt.priceCents || 0) / 100, // API返回分，转换为美元用于前端显示
            quantity_total: tt.inventoryLimit || null,
            max_per_order: tt.maxPerOrder || 10,
            age_requirement: (tt.ageRequirement || 'NONE') as 'NONE' | '18_PLUS' | '21_PLUS',
            sales_start_at: tt.salesStartAt || null,
            sales_end_at: tt.salesEndAt || null,
            status: (tt.status || 'DRAFT') as 'DRAFT' | 'ACTIVE' | 'HIDDEN',
            sort_order: tt.sortOrder || 0,
            redeem_limit: tt.redeemLimit || 1,
            redeem_start_at_override: tt.redeemStartAtOverride || null,
            redeem_end_at_override: tt.redeemEndAtOverride || null,
            sold_count: tt.soldCount || 0, // 已售出数量
          })));
        }

        // Set refund policy
        if (event.refundPolicy) {
          setRefundPolicy(event.refundPolicy as any);
        }

        // Load venues（按 region 过滤）
        if (event.merchant?.id) {
          await loadAllVenues(rid || undefined, event.merchant.id);
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

  // Track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [title, subtitle, description, regionId, venueId, startDate, startTime, endDate, endTime, ticketTypes, refundPolicy]);

  // Handle cross-day events: if end_time < start_time, auto-adjust end_date
  useEffect(() => {
    if (startDate && startTime && endDate && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // If end is before or equal to start, add 1 day to end
        if (end <= start) {
          const newEnd = new Date(end);
          newEnd.setDate(newEnd.getDate() + 1);
          setEndDate(newEnd.toISOString().split('T')[0]);
          // Show a brief notification
          console.log('[EditEvent] Auto-adjusted end date for cross-day event');
        }
      }
    }
  }, [startDate, startTime, endDate, endTime]);

  // Default redeem window (only if not already set from event data)
  useEffect(() => {
    if (startDate && startTime && endDate && endTime && !redeemWindowInitialized && !redeemStartDate) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // Default: start 30 minutes before event start
        const defaultRedeemStart = new Date(start);
        defaultRedeemStart.setMinutes(defaultRedeemStart.getMinutes() - 30);
        setRedeemStartDate(defaultRedeemStart.toISOString().split('T')[0]);
        setRedeemStartTime(defaultRedeemStart.toTimeString().slice(0, 5));
        
        // Default: end 60 minutes after event end
        const defaultRedeemEnd = new Date(end);
        defaultRedeemEnd.setMinutes(defaultRedeemEnd.getMinutes() + 60);
        setRedeemEndDate(defaultRedeemEnd.toISOString().split('T')[0]);
        setRedeemEndTime(defaultRedeemEnd.toTimeString().slice(0, 5));
        
        setRedeemWindowInitialized(true);
      }
    }
  }, [startDate, startTime, endDate, endTime, redeemStartDate, redeemWindowInitialized]);

  // 加载该 merchant 下的 venues；regionIdParam 过滤只显示该 region 的 venues；merchantIdParam 用于初次加载时传入
  const loadAllVenues = async (regionIdParam?: string, merchantIdParam?: string) => {
    const targetMerchantId = merchantIdParam || merchantId;
    if (!targetMerchantId) return;
    const url = `/api/admin/venues?merchant_id=${targetMerchantId}` + (regionIdParam ? `&region_id=${regionIdParam}` : '');
    try {
      const res = await fetch(url);
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

  const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setPosterFile(file);

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPosterPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      if (merchantId) {
        formData.append('merchant_id', merchantId);
      }

      const res = await fetch('/api/admin/uploads/poster', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.data) {
        setPosterUrl(data.data.poster_url || data.data.signed_url);
        setHasUnsavedChanges(true);
      } else {
        throw new Error(data.error?.message || data.message || 'Failed to upload poster');
      }
    } catch (err: any) {
      console.error('Poster upload error:', err);
      alert(err.message || 'Failed to upload poster');
      setPosterFile(null);
      setPosterPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleVenueChange = (newVenueId: string) => {
    const venue = venues.find(v => v.id === newVenueId);
    setVenueId(newVenueId);
    setSelectedVenue(venue || null);
    setHasUnsavedChanges(true);
  };

  const addTicketType = (template?: '18_20' | '21_PLUS' | 'DRINK' | 'SKIP_LINE') => {
    let newTicket: TicketType;

    if (template === '18_20') {
      newTicket = {
        name: '18-20 Entry',
        description: '',
        category: 'ENTRY',
        price_cents: 25,
        quantity_total: null,
        max_per_order: 4,
        age_requirement: '18_PLUS',
        sales_start_at: null,
        sales_end_at: null,
        status: 'ACTIVE',
        sort_order: ticketTypes.length,
        redeem_limit: 1,
        redeem_start_at_override: null,
        redeem_end_at_override: null,
      };
    } else if (template === '21_PLUS') {
      newTicket = {
        name: '21+ Entry',
        description: '',
        category: 'ENTRY',
        price_cents: 30,
        quantity_total: null,
        max_per_order: 4,
        age_requirement: '21_PLUS',
        sales_start_at: null,
        sales_end_at: null,
        status: 'ACTIVE',
        sort_order: ticketTypes.length,
        redeem_limit: 1,
        redeem_start_at_override: null,
        redeem_end_at_override: null,
      };
    } else if (template === 'DRINK') {
      newTicket = {
        name: 'Drink Ticket',
        description: 'One free drink',
        category: 'DRINK',
        price_cents: 15,
        quantity_total: null,
        max_per_order: 10,
        age_requirement: '21_PLUS',
        sales_start_at: null,
        sales_end_at: null,
        status: 'ACTIVE',
        sort_order: ticketTypes.length,
        redeem_limit: 1,
        redeem_start_at_override: null,
        redeem_end_at_override: null,
      };
    } else if (template === 'SKIP_LINE') {
      newTicket = {
        name: 'Skip Line / VIP Fast Pass',
        description: 'Skip the line and enter faster',
        category: 'SKIP_LINE',
        price_cents: 50,
        quantity_total: null,
        max_per_order: 4,
        age_requirement: '21_PLUS',
        sales_start_at: null,
        sales_end_at: null,
        status: 'ACTIVE',
        sort_order: ticketTypes.length,
        redeem_limit: 1,
        redeem_start_at_override: null,
        redeem_end_at_override: null,
      };
    } else {
      newTicket = {
        name: '',
        description: '',
        category: 'ENTRY',
        price_cents: 0,
        quantity_total: null,
        max_per_order: 4,
        age_requirement: 'NONE',
        sales_start_at: null,
        sales_end_at: null,
        status: 'DRAFT',
        sort_order: ticketTypes.length,
        redeem_limit: 1,
        redeem_start_at_override: null,
        redeem_end_at_override: null,
      };
    }

    setEditingTicketType(newTicket);
    setShowTicketTypeModal(true);
  };

  const saveTicketType = () => {
    if (!editingTicketType) return;

    if (!editingTicketType.name.trim()) {
      alert('Ticket type name is required');
      return;
    }

    if (editingTicketType.price_cents < 0) {
      alert('Price must be >= 0');
      return;
    }

    if (editingTicketType.id) {
      // Update existing
      setTicketTypes(prev =>
        prev.map(tt => tt.id === editingTicketType.id ? editingTicketType : tt)
      );
    } else {
      // Add new
      setTicketTypes(prev => [...prev, { ...editingTicketType, id: `temp-${Date.now()}` }]);
    }

    setShowTicketTypeModal(false);
    setEditingTicketType(null);
    setHasUnsavedChanges(true);
  };

  const deleteTicketType = (id: string) => {
    const ticketType = ticketTypes.find(tt => tt.id === id);
    
    // Check if ticket has been sold
    if (ticketType && ticketType.sold_count && ticketType.sold_count > 0) {
      if (!confirm(`This ticket type has ${ticketType.sold_count} sold tickets. You cannot delete it, but you can deactivate it. Deactivate instead?`)) {
        return;
      }
      // Deactivate instead of delete
      setTicketTypes(prev =>
        prev.map(tt => tt.id === id ? { ...tt, status: 'HIDDEN' as const } : tt)
      );
      setHasUnsavedChanges(true);
      return;
    }

    if (confirm('Are you sure you want to delete this ticket type?')) {
      setTicketTypes(prev => prev.filter(tt => tt.id !== id));
      setHasUnsavedChanges(true);
    }
  };

  const editTicketType = (ticketType: TicketType) => {
    setEditingTicketType(ticketType);
    setShowTicketTypeModal(true);
  };

  // Draft save: minimal validation
  const validateDraft = (): string[] => {
    const errors: string[] = [];
    
    if (startDate && startTime && endDate && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
        errors.push('End time must be after start time');
      }
    }
    
    for (const tt of ticketTypes) {
      if (tt.name.trim() && tt.price_cents < 0) {
        errors.push(`Ticket type "${tt.name}" must have a valid price`);
      }
    }
    
    return errors;
  };

  // Publish validation: strict
  const validatePublish = (): string[] => {
    const errors: string[] = [];

    if (!title.trim()) errors.push('Event title is required');
    if (!regionId) errors.push('Region is required');
    if (!venueId) {
      errors.push('Venue is required. Please select a venue.');
    }
    if (!startDate || !startTime) errors.push('Start date and time are required');
    if (!endDate || !endTime) errors.push('End date and time are required');

    if (startDate && startTime && endDate && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push('Invalid date format');
      } else if (end <= start) {
        errors.push('End time must be after start time');
      }
    }

    const activeTickets = ticketTypes.filter(tt => tt.status === 'ACTIVE');
    if (activeTickets.length === 0) {
      errors.push('At least one active ticket type is required');
    }

    for (const tt of activeTickets) {
      if (!tt.name.trim()) {
        errors.push(`Ticket type "${tt.name || 'unnamed'}" must have a name`);
      }
      if (tt.price_cents < 0) {
        errors.push(`Ticket type "${tt.name}" must have a valid price`);
      }
    }

    return errors;
  };

  const handleSaveDraft = async () => {
    if (!eventId) return;

    const errors = validateDraft();
    if (errors.length > 0) {
      setValidationErrors(errors);
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    try {
      setSaving(true);
      setValidationErrors([]);

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

      let validRedeemStart = null;
      let validRedeemEnd = null;
      
      if (redeemStart && !isNaN(redeemStart.getTime())) {
        validRedeemStart = redeemStart;
      }
      if (redeemEnd && !isNaN(redeemEnd.getTime())) {
        validRedeemEnd = redeemEnd;
      }

      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          poster_url: posterUrl || null,
          venue_id: venueId || null,
          region_id: regionId || undefined,
          start_at: startDateTime?.toISOString() || null,
          end_at: endDateTime?.toISOString() || null,
          redeem_start_at: validRedeemStart?.toISOString() || null,
          redeem_end_at: validRedeemEnd?.toISOString() || null,
          refund_policy: refundPolicy,
          published_status: 'DRAFT',
          ticket_types: ticketTypes.map(tt => ({
            id: tt.id,
            name: tt.name,
            description: tt.description,
            category: tt.category,
            price_cents: tt.price_cents,
            quantity_total: tt.quantity_total,
            max_per_order: tt.max_per_order,
            age_requirement: tt.age_requirement,
            sales_start_at: tt.sales_start_at,
            sales_end_at: tt.sales_end_at,
            status: tt.status,
            sort_order: tt.sort_order,
            redeem_limit: tt.redeem_limit,
            redeem_start_at_override: tt.redeem_start_at_override,
            redeem_end_at_override: tt.redeem_end_at_override,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to save draft');
      }

      setHasUnsavedChanges(false);
      alert('Draft saved successfully!');
    } catch (err: any) {
      console.error('Save draft error:', err);
      alert(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!eventId) return;

    const errors = validatePublish();
    if (errors.length > 0) {
      setValidationErrors(errors);
      alert('Cannot publish event. Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    if (!showPublishConfirm) {
      setShowPublishConfirm(true);
      return;
    }

    try {
      setPublishing(true);
      setValidationErrors([]);
      setShowPublishConfirm(false);

      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${endDate}T${endTime}`);
      
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        throw new Error('Invalid date format');
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
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          poster_url: posterUrl || null,
          venue_id: venueId,
          region_id: regionId || undefined,
          start_at: startDateTime.toISOString(),
          end_at: endDateTime.toISOString(),
          redeem_start_at: redeemStart?.toISOString() || null,
          redeem_end_at: redeemEnd?.toISOString() || null,
          refund_policy: refundPolicy,
          published_status: 'PUBLISHED',
          ticket_types: ticketTypes.map(tt => ({
            id: tt.id,
            name: tt.name,
            description: tt.description,
            category: tt.category,
            price_cents: tt.price_cents,
            quantity_total: tt.quantity_total,
            max_per_order: tt.max_per_order,
            age_requirement: tt.age_requirement,
            sales_start_at: tt.sales_start_at,
            sales_end_at: tt.sales_end_at,
            status: tt.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
            sort_order: tt.sort_order,
            redeem_limit: tt.redeem_limit,
            redeem_start_at_override: tt.redeem_start_at_override,
            redeem_end_at_override: tt.redeem_end_at_override,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to publish event');
      }

      setHasUnsavedChanges(false);
      setCurrentStatus('published');
      alert('Event published successfully!');
      // Refresh page to show updated status
      window.location.reload();
    } catch (err: any) {
      console.error('Publish error:', err);
      alert(err.message || 'Failed to publish event');
    } finally {
      setPublishing(false);
    }
  };

  const handlePause = async () => {
    if (!eventId) return;

    if (!confirm('Are you sure you want to pause this event? Customers will not be able to purchase new tickets, but existing tickets remain valid.')) {
      return;
    }

    try {
      setPausing(true);

      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          published_status: 'PAUSED',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to pause event');
      }

      setCurrentStatus('paused');
      alert('Event paused successfully!');
      window.location.reload();
    } catch (err: any) {
      console.error('Pause error:', err);
      alert(err.message || 'Failed to pause event');
    } finally {
      setPausing(false);
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

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <AdminTopBar title="Edit Event" showBack />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-32">
        {/* Unsaved Changes Warning */}
        {hasUnsavedChanges && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <span className="material-symbols-outlined text-sm align-middle mr-1">warning</span>
              You have unsaved changes. Don't forget to save!
            </p>
          </div>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-4 bg-alert-red/10 border border-alert-red rounded-lg">
            <p className="text-alert-red font-semibold mb-2">Please fix the following errors:</p>
            <ul className="list-disc list-inside text-sm text-alert-red space-y-1">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Section H: Read-only Stats */}
        {eventStats && (
          <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">📊 Event Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Orders</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{eventStats.totalOrders}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-primary">{eventStats.totalRevenueFormatted}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Redeemed Tickets</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{eventStats.redeemedTickets}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Event ID</p>
                <p className="text-sm font-mono text-slate-600 dark:text-slate-400 break-all">{eventId}</p>
              </div>
            </div>
          </section>
        )}

        {/* Section 1: Poster & Branding */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">① Poster & Branding</h3>
          
          {/* Poster Upload */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Event Poster
            </label>
            {posterPreview ? (
              <div className="relative">
                <img
                  src={posterPreview}
                  alt="Poster preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    setPosterFile(null);
                    setPosterPreview(null);
                    setPosterUrl(null);
                    setHasUnsavedChanges(true);
                  }}
                  className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">image</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Click to upload poster</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">JPEG, PNG, WebP (max 5MB)</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handlePosterUpload}
                  disabled={loading}
                />
              </label>
            )}
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Event Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setHasUnsavedChanges(true);
              }}
              placeholder="e.g. Midnight Renaissance"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Subtitle/Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Subtitle / Tags <span className="text-xs text-slate-500">(Optional, e.g. #House #Back2School #VIP)</span>
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => {
                setSubtitle(e.target.value);
                setHasUnsavedChanges(true);
              }}
              placeholder="e.g. #HouseMusic #VIP #Back2School"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          
          {/* Poster Preview with Title Overlay */}
          {posterPreview && title && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Preview:</p>
              <div className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                <img
                  src={posterPreview}
                  alt="Poster preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white font-bold text-sm line-clamp-2">{title}</p>
                  {subtitle && (
                    <p className="text-white/80 text-xs mt-1">{subtitle}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setHasUnsavedChanges(true);
              }}
              placeholder="Describe your event..."
              rows={4}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-base resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </section>

        {/* Section 2: Venue & Basics */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">② Venue & Basics</h3>
          
          {/* Region：先选 Region，Venue 仅显示该 region 下的 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Region <span className="text-red-500">*</span>
            </label>
            <select
              value={regionId}
              onChange={(e) => {
                const v = e.target.value;
                setRegionId(v);
                setVenueId('');
                setSelectedVenue(null);
                setHasUnsavedChanges(true);
                setLoadingVenue(true);
                loadAllVenues(v || undefined).finally(() => setLoadingVenue(false));
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select region...</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {loadingVenue ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-3 text-slate-500 dark:text-slate-400">Loading venue...</span>
            </div>
          ) : selectedVenue ? (
            <div>
              {/* Current venue display */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Venue
                </label>
                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedVenue.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Merchant: {selectedVenue.merchant.name}
                        </p>
                        {selectedVenue.region && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined text-xs align-middle">public</span>
                            Region: {selectedVenue.region.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedVenue.address && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span className="material-symbols-outlined text-xs align-middle">location_on</span>
                      {selectedVenue.address}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Change Venue (if multiple venues available) */}
              {venues.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Change Venue <span className="text-xs text-slate-500">(Optional)</span>
                  </label>
                  <select
                    value={venueId}
                    onChange={(e) => handleVenueChange(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name} {venue.id === selectedVenue.id ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
              <div className="text-center">
                <span className="material-symbols-outlined text-4xl text-slate-400 mb-3">store</span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  No venue bound to this event
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Please select a venue.
                </p>
                {venues.length > 0 ? (
                  <select
                    onChange={(e) => handleVenueChange(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="">Select a venue...</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No venues available for this merchant.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Section 3: Event Time */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">③ Event Time</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Timezone: <span className="font-medium">{regions.find(r => r.id === regionId)?.name || selectedVenue?.region?.name || 'America/New_York'}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                End Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>
          {/* Cross-day indicator */}
          {startDate && startTime && endDate && endTime && (() => {
            const start = new Date(`${startDate}T${startTime}`);
            const end = new Date(`${endDate}T${endTime}`);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
              const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
              if (hours > 24 || endDate !== startDate) {
                return (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    <span className="material-symbols-outlined text-xs align-middle">schedule</span>
                    This is a {hours > 24 ? 'multi-day' : 'cross-day'} event ({hours.toFixed(1)} hours)
                  </p>
                );
              }
            }
            return null;
          })()}
        </section>

        {/* Section 4: Ticket Redemption Window */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">④ Ticket Redemption Window</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            这决定扫码可用时间，可不同于活动时间（比如提前入场）。Staff scanners 只能在此时间窗口内验票。
          </p>
          
          {/* Quick Set Buttons */}
          {startDate && startTime && endDate && endTime && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const start = new Date(`${startDate}T${startTime}`);
                  const end = new Date(`${endDate}T${endTime}`);
                  setRedeemStartDate(startDate);
                  setRedeemStartTime(startTime);
                  setRedeemEndDate(endDate);
                  setRedeemEndTime(endTime);
                  setHasUnsavedChanges(true);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Same as Event Time
              </button>
              <button
                type="button"
                onClick={() => {
                  const start = new Date(`${startDate}T${startTime}`);
                  start.setHours(start.getHours() - 1);
                  setRedeemStartDate(start.toISOString().split('T')[0]);
                  setRedeemStartTime(start.toTimeString().slice(0, 5));
                  setHasUnsavedChanges(true);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Start 1 hour earlier
              </button>
              <button
                type="button"
                onClick={() => {
                  const end = new Date(`${endDate}T${endTime}`);
                  end.setHours(end.getHours() + 1);
                  setRedeemEndDate(end.toISOString().split('T')[0]);
                  setRedeemEndTime(end.toTimeString().slice(0, 5));
                  setHasUnsavedChanges(true);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                End 1 hour later
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Valid From</label>
              <input
                type="date"
                value={redeemStartDate}
                onChange={(e) => {
                  setRedeemStartDate(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Valid From Time</label>
              <input
                type="time"
                value={redeemStartTime}
                onChange={(e) => {
                  setRedeemStartTime(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Valid Until</label>
              <input
                type="date"
                value={redeemEndDate}
                onChange={(e) => {
                  setRedeemEndDate(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Valid Until Time</label>
              <input
                type="time"
                value={redeemEndTime}
                onChange={(e) => {
                  setRedeemEndTime(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </section>

        {/* Section 5: Ticket Types */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">⑤ Ticket Types</h3>
            <AdminButton
              variant="outline"
              onClick={() => addTicketType()}
            >
              <span className="material-symbols-outlined text-sm mr-1">add</span>
              Add Ticket Type
            </AdminButton>
          </div>

          {/* Quick Templates */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => addTicketType('18_20')}
              className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            >
              18-20 Entry
            </button>
            <button
              onClick={() => addTicketType('21_PLUS')}
              className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            >
              21+ Entry
            </button>
            <button
              onClick={() => addTicketType('DRINK')}
              className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            >
              Drink Ticket
            </button>
            <button
              onClick={() => addTicketType('SKIP_LINE')}
              className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            >
              Skip Line
            </button>
          </div>

          {/* Ticket Types List */}
          {ticketTypes.length > 0 ? (
            <div className="space-y-3">
              {ticketTypes.map((tt, index) => {
                const hasSoldTickets = (tt.sold_count || 0) > 0;
                return (
                  <div
                    key={tt.id || index}
                    className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-slate-900 dark:text-white">{tt.name}</p>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            tt.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                            tt.status === 'HIDDEN' ? 'bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-200' :
                            'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                          }`}>
                            {tt.status}
                          </span>
                          {tt.age_requirement !== 'NONE' && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                              {tt.age_requirement === '18_PLUS' ? '18+' : '21+'}
                            </span>
                          )}
                          {hasSoldTickets && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                              {tt.sold_count} sold
                            </span>
                          )}
                        </div>
                        {tt.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{tt.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                          <span>${tt.price_cents.toFixed(2)}</span>
                          {tt.quantity_total !== null && (
                            <span>Qty: {tt.quantity_total}</span>
                          )}
                          <span>Max/Order: {tt.max_per_order}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => editTicketType(tt)}
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Edit ticket type"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button
                          onClick={() => deleteTicketType(tt.id!)}
                          className={`p-2 rounded-lg transition-colors ${
                            hasSoldTickets
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-alert-red hover:bg-alert-red/10'
                          }`}
                          title={hasSoldTickets ? 'Cannot delete: has sold tickets. Use deactivate instead.' : 'Delete ticket type'}
                          disabled={hasSoldTickets}
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                    {hasSoldTickets && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        ⚠️ This ticket type has {tt.sold_count} sold tickets. Price changes will only affect new orders.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">confirmation_number</span>
              <p className="text-slate-500 dark:text-slate-400 mb-4">No ticket types yet</p>
              <AdminButton
                variant="outline"
                onClick={() => addTicketType()}
              >
                Add First Ticket Type
              </AdminButton>
            </div>
          )}
        </section>

        {/* Section 6: Policies */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Policies</h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Refund Policy</label>
            <select
              value={refundPolicy}
              onChange={(e) => {
                setRefundPolicy(e.target.value as any);
                setHasUnsavedChanges(true);
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="no_refund">No Refund</option>
              <option value="24h">24 Hours</option>
              <option value="UNTIL_START">Until Event Start</option>
              <option value="flexible">Flexible</option>
              <option value="venue_policy">Venue Policy</option>
              <option value="CUSTOM">Custom</option>
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              ID required. Age requirements are set per ticket type above.
            </p>
          </div>
        </section>
      </main>

      {/* Section 7: Actions (Fixed Bottom) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-4 shadow-lg">
        <div className="max-w-2xl mx-auto flex gap-3">
          <AdminButton
            variant="outline"
            fullWidth
            onClick={() => {
              if (hasUnsavedChanges && !confirm('You have unsaved changes. Are you sure you want to leave?')) {
                return;
              }
              router.back();
            }}
          >
            Cancel
          </AdminButton>
          <AdminButton
            variant="outline"
            fullWidth
            onClick={handleSaveDraft}
            loading={saving}
            disabled={publishing || pausing}
          >
            Save Draft
          </AdminButton>
          {currentStatus === 'published' && (
            <AdminButton
              variant="outline"
              fullWidth
              onClick={handlePause}
              loading={pausing}
              disabled={saving || publishing}
            >
              Pause
            </AdminButton>
          )}
          {currentStatus !== 'published' && (
            <AdminButton
              variant="primary"
              fullWidth
              onClick={handlePublish}
              loading={publishing}
              disabled={saving || pausing}
            >
              {showPublishConfirm ? 'Confirm Publish' : 'Publish'}
            </AdminButton>
          )}
        </div>
      </div>

      {/* Publish Confirmation Modal */}
      {showPublishConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPublishConfirm(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-white dark:bg-slate-800 rounded-t-xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Confirm Publish</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Are you sure you want to publish this event? Once published, it will be visible to customers.
            </p>
            <div className="flex gap-3">
              <AdminButton
                variant="outline"
                fullWidth
                onClick={() => setShowPublishConfirm(false)}
              >
                Cancel
              </AdminButton>
              <AdminButton
                variant="primary"
                fullWidth
                onClick={handlePublish}
              >
                Publish
              </AdminButton>
            </div>
          </div>
        </>
      )}

      {/* Ticket Type Modal */}
      {showTicketTypeModal && editingTicketType && (
        <TicketTypeModal
          ticketType={editingTicketType}
          onChange={setEditingTicketType}
          onSave={saveTicketType}
          onCancel={() => {
            setShowTicketTypeModal(false);
            setEditingTicketType(null);
          }}
        />
      )}
    </div>
  );
}

// Ticket Type Modal Component (复用创建页面的组件)
function TicketTypeModal({
  ticketType,
  onChange,
  onSave,
  onCancel,
}: {
  ticketType: TicketType;
  onChange: (tt: TicketType) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[480px] mx-auto bg-white dark:bg-slate-800 rounded-t-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Edit Ticket Type</h3>
        
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={ticketType.name}
              onChange={(e) => onChange({ ...ticketType, name: e.target.value })}
              placeholder="e.g. General Admission"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
            <textarea
              value={ticketType.description}
              onChange={(e) => onChange({ ...ticketType, description: e.target.value })}
              placeholder="Optional description"
              rows={2}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-base resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Category</label>
            <select
              value={ticketType.category}
              onChange={(e) => onChange({ ...ticketType, category: e.target.value as any })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ENTRY">Entry</option>
              <option value="DRINK">Drink</option>
              <option value="VIP">VIP</option>
              <option value="SKIP_LINE">Skip Line</option>
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Price (USD) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={ticketType.price_cents}
              onChange={(e) => onChange({ ...ticketType, price_cents: parseFloat(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Quantity Total */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Total Quantity (leave empty for unlimited)
            </label>
            <input
              type="number"
              min="0"
              value={ticketType.quantity_total || ''}
              onChange={(e) => onChange({ ...ticketType, quantity_total: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="Unlimited"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Max Per Order */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Max Per Order</label>
            <input
              type="number"
              min="1"
              value={ticketType.max_per_order}
              onChange={(e) => onChange({ ...ticketType, max_per_order: parseInt(e.target.value) || 1 })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Age Requirement */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Age Requirement</label>
            <select
              value={ticketType.age_requirement}
              onChange={(e) => onChange({ ...ticketType, age_requirement: e.target.value as any })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="NONE">No Age Restriction</option>
              <option value="18_PLUS">18+ Only</option>
              <option value="21_PLUS">21+ Only</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
            <select
              value={ticketType.status}
              onChange={(e) => onChange({ ...ticketType, status: e.target.value as any })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="HIDDEN">Hidden</option>
            </select>
          </div>

          {/* Sales Window (Optional) */}
          <details className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Sales Window (Optional)
            </summary>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Sales Start Date</label>
                  <input
                    type="date"
                    value={ticketType.sales_start_at ? new Date(ticketType.sales_start_at).toISOString().split('T')[0] : ''}
                    onChange={(e) => onChange({
                      ...ticketType,
                      sales_start_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Sales Start Time</label>
                  <input
                    type="time"
                    value={ticketType.sales_start_at ? new Date(ticketType.sales_start_at).toTimeString().slice(0, 5) : ''}
                    onChange={(e) => {
                      const date = ticketType.sales_start_at ? new Date(ticketType.sales_start_at) : new Date();
                      const [hours, minutes] = e.target.value.split(':');
                      date.setHours(parseInt(hours), parseInt(minutes));
                      onChange({ ...ticketType, sales_start_at: date.toISOString() });
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 px-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Sales End Date</label>
                  <input
                    type="date"
                    value={ticketType.sales_end_at ? new Date(ticketType.sales_end_at).toISOString().split('T')[0] : ''}
                    onChange={(e) => onChange({
                      ...ticketType,
                      sales_end_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Sales End Time</label>
                  <input
                    type="time"
                    value={ticketType.sales_end_at ? new Date(ticketType.sales_end_at).toTimeString().slice(0, 5) : ''}
                    onChange={(e) => {
                      const date = ticketType.sales_end_at ? new Date(ticketType.sales_end_at) : new Date();
                      const [hours, minutes] = e.target.value.split(':');
                      date.setHours(parseInt(hours), parseInt(minutes));
                      onChange({ ...ticketType, sales_end_at: date.toISOString() });
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-10 px-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </details>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <AdminButton
              variant="outline"
              fullWidth
              onClick={onCancel}
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="primary"
              fullWidth
              onClick={onSave}
            >
              Save
            </AdminButton>
          </div>
        </div>
      </div>
    </>
  );
}

// Wrap with Suspense to handle params
export default function AdminEditEventPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <AdminEditEventPageContent params={params} />
    </Suspense>
  );
}
