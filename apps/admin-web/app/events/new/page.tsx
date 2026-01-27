/**
 * Admin Create Event Page - Enhanced Version
 * 管理员创建新活动页面（完整版）
 * 支持：海报、多个票种、核销窗口、完整策略配置
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminButton from '@/components/admin/AdminButton';
import WeeklyScheduleEditor, { WeeklyRule } from '@/components/admin/WeeklyScheduleEditor';
import TicketDayPricingEditor, { DayPrice } from '@/components/admin/TicketDayPricingEditor';

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
  price_cents: number; // 美元金额（前端显示），API 会转换为分
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
  day_prices?: DayPrice[];
}

function AdminCreateEventPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const merchantId = searchParams.get('merchant_id');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string; state: string | null; country: string }[]>([]);
  const [regionId, setRegionId] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loadingVenue, setLoadingVenue] = useState(true);
  const [hasDefaultVenue, setHasDefaultVenue] = useState<boolean | null>(null);
  const [merchantName, setMerchantName] = useState<string>('');

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
  
  // Weekly Schedule & Pricing
  const [scheduleMode, setScheduleMode] = useState<'single' | 'weekly'>('weekly');
  const [weeklyRules, setWeeklyRules] = useState<WeeklyRule[]>([]);
  const [pricingTicketId, setPricingTicketId] = useState<string | null>(null); // ID of ticket being edited for pricing

  // Section 6: Policies
  const [refundPolicy, setRefundPolicy] = useState<'no_refund' | '24h' | 'flexible' | 'venue_policy' | 'UNTIL_START' | 'CUSTOM'>('no_refund');

  // 加载 regions
  useEffect(() => {
    fetch('/api/admin/regions')
      .then((r) => r.json())
      .then((d) => { if (d.success && d.data) setRegions(d.data); })
      .catch(() => {});
  }, []);

  // 加载 merchant default venue
  useEffect(() => {
    if (merchantId) {
      loadMerchantDefaultVenue();
    } else {
      setLoadingVenue(false);
      setHasDefaultVenue(false);
    }
  }, [merchantId]);

  // 默认设置核销窗口（活动开始前30分钟到结束后60分钟）
  useEffect(() => {
    if (startDate && startTime && endDate && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // 默认：开始前30分钟
        const defaultRedeemStart = new Date(start);
        defaultRedeemStart.setMinutes(defaultRedeemStart.getMinutes() - 30);
        setRedeemStartDate(defaultRedeemStart.toISOString().split('T')[0]);
        setRedeemStartTime(defaultRedeemStart.toTimeString().slice(0, 5));
        
        // 默认：结束后60分钟
        const defaultRedeemEnd = new Date(end);
        defaultRedeemEnd.setMinutes(defaultRedeemEnd.getMinutes() + 60);
        setRedeemEndDate(defaultRedeemEnd.toISOString().split('T')[0]);
        setRedeemEndTime(defaultRedeemEnd.toTimeString().slice(0, 5));
      }
    }
  }, [startDate, startTime, endDate, endTime]);

  // 加载 merchant 的 default venue
  const loadMerchantDefaultVenue = async () => {
    if (!merchantId) {
      setLoadingVenue(false);
      setHasDefaultVenue(false);
      return;
    }

    try {
      setLoadingVenue(true);
      
      // 优先获取 merchant 的 default venue
      const defaultVenueRes = await fetch(`/api/admin/merchants/${merchantId}/default-venue`);
      
      // 检查响应状态，避免解析HTML错误页面
      if (!defaultVenueRes.ok) {
        const errorText = await defaultVenueRes.text();
        console.error('[Create Event] Default venue API error:', defaultVenueRes.status, errorText);
        
        // 尝试解析JSON错误
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { code: 'HTTP_ERROR', message: `HTTP ${defaultVenueRes.status}` } };
        }
        
        // 如果是404，merchant可能不存在，但继续尝试加载venues
        if (defaultVenueRes.status === 404) {
          console.warn('[Create Event] Merchant not found, but continuing...');
          setHasDefaultVenue(false);
          await loadAllVenues(undefined);
          return;
        }
        setHasDefaultVenue(false);
        await loadAllVenues(undefined);
        return;
      }
      
      const defaultVenueData = await defaultVenueRes.json();
      
      if (defaultVenueData.success && defaultVenueData.data) {
        const { venue, merchant_name } = defaultVenueData.data;
        
        setMerchantName(merchant_name);
        
        if (venue) {
          setHasDefaultVenue(true);
          setVenueId(venue.id);
          const rid = venue.region_id || null;
          if (rid) setRegionId(rid);
          setSelectedVenue({
            id: venue.id,
            name: venue.name,
            address: venue.address,
            region_id: venue.region_id || null,
            region: venue.region || null,
            merchant: { id: merchantId, name: merchant_name },
          });
          await loadAllVenues(rid || undefined);
        } else {
          setHasDefaultVenue(false);
          await loadAllVenues();
        }
      } else {
        setHasDefaultVenue(false);
        await loadAllVenues();
      }
    } catch (err) {
      console.error('Failed to load merchant default venue:', err);
      setHasDefaultVenue(false);
      await loadAllVenues();
    } finally {
      setLoadingVenue(false);
    }
  };

  // 加载所有venues（用于更换venue或绑定venue）；regionId 过滤该 region 的 venues
  const loadAllVenues = async (regionIdParam?: string) => {
    if (!merchantId) return;
    const url = `/api/admin/venues?merchant_id=${merchantId}` + (regionIdParam ? `&region_id=${regionIdParam}` : '');
    try {
      const res = await fetch(url);
      
      // 检查响应状态，避免解析HTML错误页面
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Create Event] Venues API error:', res.status, errorText);
        
        // 尝试解析JSON错误
        let errorData;
        try {
          errorData = JSON.parse(errorText);
          console.error('[Create Event] Venues API error details:', errorData);
        } catch {
          console.error('[Create Event] Venues API returned non-JSON error');
        }
        
        // 即使出错，也设置空数组，避免UI崩溃
        setVenues([]);
        return;
      }
      
      const data = await res.json();
      
      if (data.success && data.data) {
        setVenues(data.data);
      } else {
        // API返回了success:false，设置空数组
        setVenues([]);
        if (data.error) {
          console.warn('[Create Event] Venues API returned error:', data.error);
        }
      }
    } catch (err) {
      console.error('[Create Event] Failed to load venues:', err);
      // 即使出错，也设置空数组
      setVenues([]);
    }
  };

  const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // 验证文件大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setPosterFile(file);

    // 预览
    const reader = new FileReader();
    reader.onloadend = () => {
      setPosterPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // 上传
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      // 如果已选择venue，传递merchant_id
      if (selectedVenue?.merchant.id) {
        formData.append('merchant_id', selectedVenue.merchant.id);
      }

      const res = await fetch('/api/admin/uploads/poster', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.data) {
        setPosterUrl(data.data.poster_url || data.data.signed_url);
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
    
    // 如果选择了新的 merchant，更新 merchantId
    if (venue && venue.merchant.id !== merchantId) {
      router.push(`/admin/events/new?merchant_id=${venue.merchant.id}`);
    }
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
        day_prices: [],
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
        day_prices: [],
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
        day_prices: [],
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
        day_prices: [],
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
        day_prices: [],
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
      // 更新现有
      setTicketTypes(prev =>
        prev.map(tt => tt.id === editingTicketType.id ? editingTicketType : tt)
      );
    } else {
      // 添加新
      setTicketTypes(prev => [...prev, { ...editingTicketType, id: `temp-${Date.now()}` }]);
    }

    setShowTicketTypeModal(false);
    setEditingTicketType(null);
  };
  
  const saveTicketDayPricing = (prices: DayPrice[]) => {
    if (!pricingTicketId) return;
    setTicketTypes(prev => prev.map(tt => {
      if (tt.id === pricingTicketId) {
        return { ...tt, day_prices: prices };
      }
      return tt;
    }));
  };

  const deleteTicketType = (id: string) => {
    setTicketTypes(prev => prev.filter(tt => tt.id !== id));
  };

  const editTicketType = (ticketType: TicketType) => {
    setEditingTicketType(ticketType);
    setShowTicketTypeModal(true);
  };

  // 草稿保存的最小校验（允许大部分字段为空）
  const validateDraft = (): string[] => {
    const errors: string[] = [];
    
    // 草稿状态下，只做最小校验：
    // - 如果填了时间，确保时间有效
    if (startDate && startTime && endDate && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
        errors.push('End time must be after start time');
      }
    }
    
    // 如果填了票种，确保票种数据合法
    for (const tt of ticketTypes) {
      if (tt.name.trim() && tt.price_cents < 0) {
        errors.push(`Ticket type "${tt.name}" must have a valid price`);
      }
    }
    
    return errors;
  };

  // 发布时的严格校验
  const validatePublish = (): string[] => {
    const errors: string[] = [];

    // 必须字段
    if (!title.trim()) errors.push('Event title is required');
    
    // Venue is now OPTIONAL
    // We do NOT check for venueId here anymore.

    if (!startDate) errors.push(scheduleMode === 'weekly' ? 'Validity start date is required' : 'Start date is required');
    if (!endDate) errors.push(scheduleMode === 'weekly' ? 'Validity end date is required' : 'End date is required');

    if (scheduleMode === 'single') {
        if (!startTime) errors.push('Start time is required');
        if (!endTime) errors.push('End time is required');
    }

    // 验证时间
    if (scheduleMode === 'weekly') {
        if (startDate && endDate && endDate < startDate) {
            errors.push('Validity end date must be after start date');
        }
        // Check at least one enabled day
        const enabled = weeklyRules.some(r => r.is_on_sale);
        if (!enabled) {
            errors.push('At least one day must be enabled in Weekly Schedule');
        }
    } else {
        // Single mode
        if (startDate && startTime && endDate && endTime) {
            const start = new Date(`${startDate}T${startTime}`);
            const end = new Date(`${endDate}T${endTime}`);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                errors.push('Invalid date format');
            } else if (end <= start) {
                errors.push('End time must be after start time');
            }
        }
    }

    // 验证至少有一个 ACTIVE 票种
    const activeTickets = ticketTypes.filter(tt => tt.status === 'ACTIVE');
    if (activeTickets.length === 0) {
      errors.push('At least one active ticket type is required');
    }

    // 验证每个 ACTIVE 票种
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
    // 草稿保存：只做最小校验
    const errors = validateDraft();
    if (errors.length > 0) {
      setValidationErrors(errors);
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    // 如果没有merchant_id，无法保存
    if (!merchantId) {
      alert('Merchant ID is required');
      return;
    }

    try {
      setSaving(true);
      setValidationErrors([]);

      const redeemStart = redeemStartDate && redeemStartTime
        ? new Date(`${redeemStartDate}T${redeemStartTime}`)
        : null;
      const redeemEnd = redeemEndDate && redeemEndTime
        ? new Date(`${redeemEndDate}T${redeemEndTime}`)
        : null;

      const payload: any = {
          title: title.trim() || null,
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          poster_url: posterUrl || null,
          venue_id: venueId || null,
          schedule_mode: scheduleMode,
          weekly_schedule_rules: scheduleMode === 'weekly' ? weeklyRules : null,
          refund_policy: refundPolicy,
          published_status: 'DRAFT',
          ticket_types: ticketTypes.map(tt => ({ ...tt, price_cents: tt.price_cents })),
          redeem_start_at: redeemStart?.toISOString() || null,
          redeem_end_at: redeemEnd?.toISOString() || null,
      };

      if (scheduleMode === 'weekly') {
          payload.validity_start_date = startDate || null;
          payload.validity_end_date = endDate || null;
      } else {
          // Single Mode
          let startDateTime = null;
          let endDateTime = null;
          if (startDate && startTime) startDateTime = new Date(`${startDate}T${startTime}`);
          if (endDate && endTime) endDateTime = new Date(`${endDate}T${endTime}`);
          
          if (startDateTime && !isNaN(startDateTime.getTime())) payload.start_at = startDateTime.toISOString();
          if (endDateTime && !isNaN(endDateTime.getTime())) payload.end_at = endDateTime.toISOString();
      }

      const res = await fetch(`/api/admin/merchants/${merchantId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to save event');
      }

      alert('Event saved as draft successfully!');
      // 如果有event_id，跳转到编辑页；否则留在当前页
      if (data.data?.id) {
        router.push(`/events/${data.data.id}`);
      }
    } catch (err: any) {
      console.error('Save draft error:', err);
      alert(err.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    // 发布：严格校验
    const errors = validatePublish();
    if (errors.length > 0) {
      setValidationErrors(errors);
      alert('Cannot publish event. Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    if (!merchantId) {
      alert('Merchant ID is required');
      return;
    }

    try {
      setPublishing(true);
      setValidationErrors([]);

      const redeemStart = redeemStartDate && redeemStartTime
        ? new Date(`${redeemStartDate}T${redeemStartTime}`)
        : null;
      const redeemEnd = redeemEndDate && redeemEndTime
        ? new Date(`${redeemEndDate}T${redeemEndTime}`)
        : null;

      const payload: any = {
          title: title.trim(), // Required
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          poster_url: posterUrl || null,
          venue_id: venueId || null, // Optional for publish now
          schedule_mode: scheduleMode,
          weekly_schedule_rules: scheduleMode === 'weekly' ? weeklyRules : null,
          refund_policy: refundPolicy,
          published_status: 'PUBLISHED',
          ticket_types: ticketTypes.map(tt => ({
            ...tt,
            price_cents: tt.price_cents,
            status: tt.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
          })),
          redeem_start_at: redeemStart?.toISOString() || null,
          redeem_end_at: redeemEnd?.toISOString() || null,
      };

      if (scheduleMode === 'weekly') {
          payload.validity_start_date = startDate;
          payload.validity_end_date = endDate;
      } else {
          // Single Mode
          const startDateTime = new Date(`${startDate}T${startTime}`);
          const endDateTime = new Date(`${endDate}T${endTime}`);
          payload.start_at = startDateTime.toISOString();
          payload.end_at = endDateTime.toISOString();
      }

      const res = await fetch(`/api/admin/merchants/${merchantId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to publish event');
      }

      alert('Event published successfully!');
      router.push(`/events/${data.data.id}`);
    } catch (err: any) {
      console.error('Publish error:', err);
      alert(err.message || 'Failed to publish event');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <AdminTopBar title="Create Event" showBack />
      
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6 pb-32">
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

        {/* Section 1: Poster & Branding */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">① Poster & Branding</h3>
          
          {/* Poster Upload */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Event Poster <span className="text-red-500">*</span>
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
                  }}
                  className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"
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
              onChange={(e) => setTitle(e.target.value)}
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
              onChange={(e) => setSubtitle(e.target.value)}
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
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your event..."
              rows={4}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2 text-base resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </section>

        {/* Section 2: Venue & Basics */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">② Venue & Basics</h3>
          
          {/* Region: 自动从 venue 继承，只读显示 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Region <span className="text-xs text-slate-500">(auto-inherited from venue)</span>
            </label>
            <input
              type="text"
              value={selectedVenue?.region?.name 
                ? `${selectedVenue.region.name}` 
                : regionId 
                  ? regions.find(r => r.id === regionId)?.name || 'Loading...'
                  : 'Select venue first'}
              readOnly
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 h-12 px-3 text-base cursor-not-allowed"
            />
          </div>
          
          {loadingVenue ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-3 text-slate-500 dark:text-slate-400">Loading venue...</span>
            </div>
          ) : selectedVenue ? (
            <div>
              {/* 显示当前venue（只读） */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Venue <span className="text-xs text-slate-500">(Auto-selected from merchant)</span>
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
                    {/* Age Requirements Badge (从票种推导) */}
                    {ticketTypes.length > 0 && (
                      <div className="flex gap-1">
                        {ticketTypes.some(tt => tt.age_requirement === '18_PLUS') && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                            18+
                          </span>
                        )}
                        {ticketTypes.some(tt => tt.age_requirement === '21_PLUS') && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                            21+
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedVenue.address && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span className="material-symbols-outlined text-xs align-middle">location_on</span>
                      {selectedVenue.address}
                    </p>
                  )}
                </div>
              </div>
              
              {/* 更换Venue（可选，如果merchant有多个venue） */}
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
                  No venue bound to this merchant
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {merchantName ? `Merchant "${merchantName}" has no default venue.` : 'Please bind a venue to this merchant first.'}
                </p>
                <div className="flex gap-2 justify-center">
                  {venues.length > 0 ? (
                    <>
                      <button
                        onClick={() => {
                          // 如果有venues，可以选择一个并设置为default
                          if (venues.length > 0 && merchantId) {
                            const firstVenue = venues[0];
                            setVenueId(firstVenue.id);
                            setSelectedVenue(firstVenue);
                            // 可选：调用API设置default venue
                            fetch(`/api/admin/merchants/${merchantId}/default-venue`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ venue_id: firstVenue.id }),
                            }).catch(console.error);
                          }
                        }}
                        className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                      >
                        Use First Venue
                      </button>
                      <select
                        onChange={(e) => {
                          const venue = venues.find(v => v.id === e.target.value);
                          if (venue && merchantId) {
                            setVenueId(venue.id);
                            setSelectedVenue(venue);
                            fetch(`/api/admin/merchants/${merchantId}/default-venue`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ venue_id: venue.id }),
                            }).catch(console.error);
                          }
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      >
                        <option value="">Select a venue...</option>
                        {venues.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        // 跳转到venues创建页或merchant设置页
                        router.push(`/merchants/${merchantId || ''}`);
                      }}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                    >
                      Bind Venue
                    </button>
                  )}
                </div>
                  💡 Venue is optional. You can bind a venue now or later.
              </div>
            </div>
          )}
        </section>

        {/* Section 3: Event Time */}
        <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">③ Event Time & Schedule</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Timezone: <span className="font-medium">America/New_York</span>
            </span>
          </div>

          {/* Schedule Mode Toggle */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-6 w-fit">
            <button
               type="button"
               onClick={() => setScheduleMode('single')}
               className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                 scheduleMode === 'single'
                   ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                   : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
               }`}
            >
              Single Event
            </button>
            <button
               type="button"
               onClick={() => setScheduleMode('weekly')}
               className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                 scheduleMode === 'weekly'
                   ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                   : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
               }`}
            >
              Weekly Schedule
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {scheduleMode === 'weekly' ? 'Validity Start Date' : 'Start Date'} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            
            {scheduleMode === 'single' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {scheduleMode === 'weekly' ? 'Validity End Date' : 'End Date'} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            {scheduleMode === 'single' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  End Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            )}
          </div>
          
          {scheduleMode === 'weekly' && (
             <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                <WeeklyScheduleEditor
                    eventId="" 
                    scheduleMode="weekly"
                    onScheduleModeChange={() => {}} 
                    mode="local"
                    initialRules={weeklyRules}
                    onRulesChange={setWeeklyRules}
                />
             </div>
          )}
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
                onChange={(e) => setRedeemStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Valid From Time</label>
              <input
                type="time"
                value={redeemStartTime}
                onChange={(e) => setRedeemStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Valid Until</label>
              <input
                type="date"
                value={redeemEndDate}
                onChange={(e) => setRedeemEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white h-12 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Valid Until Time</label>
              <input
                type="time"
                value={redeemEndTime}
                onChange={(e) => setRedeemEndTime(e.target.value)}
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
              {ticketTypes.map((tt, index) => (
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
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button
                        onClick={() => deleteTicketType(tt.id!)}
                        className="p-2 text-alert-red hover:bg-alert-red/10 rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                      <button
                        onClick={() => setPricingTicketId(tt.id!)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1"
                        title="Edit Day Pricing"
                      >
                         <span className="material-symbols-outlined text-sm">calendar_month</span>
                         <span className="text-xs font-medium">Pricing</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
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
              onChange={(e) => setRefundPolicy(e.target.value as any)}
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
            onClick={() => router.back()}
          >
            Cancel
          </AdminButton>
          <AdminButton
            variant="outline"
            fullWidth
            onClick={handleSaveDraft}
            loading={saving}
            disabled={publishing}
          >
            Save Draft
          </AdminButton>
          <AdminButton
            variant="primary"
            fullWidth
            onClick={handlePublish}
            loading={publishing}
            disabled={saving}
          >
            Publish
          </AdminButton>
        </div>
      </div>

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
      {/* Pricing Editor Modal */}
       {!!pricingTicketId && (
        <TicketDayPricingEditor
          ticketTypeId={pricingTicketId}
          defaultPriceCents={ticketTypes.find(t => t.id === pricingTicketId)?.price_cents || 0}
          isOpen={!!pricingTicketId}
          onClose={() => setPricingTicketId(null)}
          mode="local"
          initialPrices={ticketTypes.find(t => t.id === pricingTicketId)?.day_prices}
          onSave={saveTicketDayPricing}
        />
      )}
    </>
  );
}

// Ticket Type Modal Component (与 internal-web 中的相同)
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

// Wrap with Suspense to handle useSearchParams()
export default function AdminCreateEventPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <AdminCreateEventPageContent />
    </Suspense>
  );
}
