/**
 * Admin Events Page
 * Events 列表页面（完全按照 uiadmin/events_and_pricing_control/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface Event {
  id: string;
  title: string;
  status: string;
  merchant: {
    id: string;
    name: string;
  };
  venue: {
    id: string;
    name: string;
    region: {
      id: string;
      name: string;
      state: string | null;
      country: string | null;
    };
  };
  stats: {
    minPrice: number;
    priceFormatted: string;
    totalSold: number;
    redemptionRate: number;
    isLowInventory: boolean;
    isLowRedemption: boolean;
  };
  startAt: string;
  endAt: string;
  createdAt: string;
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'lowRedemption' | 'pendingApproval'>('all');
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [pricingForm, setPricingForm] = useState({
    ticketTypeId: '',
    priceCents: 0,
    inventoryLimit: 0,
    reason: '',
  });
  const [updatingPricing, setUpdatingPricing] = useState(false);
  const [ticketTypes, setTicketTypes] = useState<any[]>([]);
  
  useEffect(() => {
    fetchEvents();
  }, [searchQuery, activeFilter]);
  
  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (activeFilter === 'active') params.set('activeOnly', 'true');
      if (activeFilter === 'lowRedemption') params.set('lowRedemption', 'true');
      if (activeFilter === 'pendingApproval') params.set('pendingApproval', 'true');
      
      const response = await fetch(`/api/admin/events?${params.toString()}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch events');
      }
      
      setEvents(result.data.events || []);
    } catch (err: any) {
      console.error('[ADMIN EVENTS] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleEditPricing = async (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    
    setSelectedEvent(event);
    
    // 获取该事件的所有票种
    try {
      const response = await fetch(`/api/admin/events/${eventId}`);
      const result = await response.json();
      
      if (result.success && result.data.ticketTypes) {
        setTicketTypes(result.data.ticketTypes);
        if (result.data.ticketTypes.length > 0) {
          const firstType = result.data.ticketTypes[0];
          setPricingForm({
            ticketTypeId: firstType.id,
            priceCents: firstType.price_cents || 0,
            inventoryLimit: firstType.inventory_limit || 0,
            reason: '',
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch ticket types:', err);
    }
    
    setShowPricingModal(true);
  };
  
  const handleSubmitPricing = async () => {
    if (!selectedEvent || !pricingForm.ticketTypeId || !pricingForm.reason.trim()) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      setUpdatingPricing(true);
      
      const response = await fetch(`/api/admin/events/${selectedEvent.id}/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketTypeId: pricingForm.ticketTypeId,
          priceCents: pricingForm.priceCents > 0 ? pricingForm.priceCents : undefined,
          inventoryLimit: pricingForm.inventoryLimit > 0 ? pricingForm.inventoryLimit : undefined,
          reason: pricingForm.reason,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to update pricing');
      }
      
      alert('Pricing updated successfully!');
      setShowPricingModal(false);
      setSelectedEvent(null);
      setPricingForm({ ticketTypeId: '', priceCents: 0, inventoryLimit: 0, reason: '' });
      
      // 刷新事件列表
      await fetchEvents();
    } catch (err: any) {
      console.error('[ADMIN EVENTS] Update pricing error:', err);
      alert(err.message);
    } finally {
      setUpdatingPricing(false);
    }
  };
  
  const getStatusBadge = (event: Event) => {
    if (event.status === 'published') {
      if (event.stats.isLowInventory) {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            Low Inv
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
          Active
        </span>
      );
    }
    if (event.status === 'pending_review') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
          Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border border-gray-200 dark:border-gray-800">
        {event.status}
      </span>
    );
  };
  
  return (
    <div className="relative flex min-h-screen w-full flex-col mx-auto max-w-[480px] bg-background-light dark:bg-background-dark border-x border-slate-200 dark:border-slate-800 shadow-2xl">
      {/* Global Header - 完全按照 UI 文档 */}
      <header className="flex items-center justify-between px-4 py-3 bg-primary shrink-0 z-20 shadow-sm border-b border-white/10">
        <h1 className="text-white text-lg font-bold leading-tight tracking-tight">Events & Pricing</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/events/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-white hover:bg-white/90 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Create Event
          </button>
          <button className="text-white hover:bg-white/10 rounded-full p-2 transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined">filter_list</span>
          </button>
        </div>
      </header>
      
      {/* Search & Filters Container - 完全按照 UI 文档 */}
      <div className="bg-white dark:bg-[#1f2937] border-b border-gray-200 dark:border-gray-700 shadow-sm shrink-0 z-10">
        {/* Search Bar */}
        <div className="px-4 py-3">
          <label className="relative flex w-full items-center">
            <span className="absolute left-3 text-slate-400 dark:text-slate-500 material-symbols-outlined">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Event or Merchant ID..."
              className="w-full bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-slate-400"
            />
          </label>
        </div>
        
        {/* Filter Chips - 完全按照 UI 文档 */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'all'
                ? 'bg-primary text-white border-primary'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'
            }`}
          >
            All Regions
          </button>
          
          <button
            onClick={() => setActiveFilter('active')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'active'
                ? 'bg-primary text-white border-primary'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'
            }`}
          >
            Active Only
          </button>
          
          <button
            onClick={() => setActiveFilter('lowRedemption')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'lowRedemption'
                ? 'bg-primary text-white border-primary'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'
            }`}
          >
            Low Redemption
          </button>
          
          <button
            onClick={() => setActiveFilter('pendingApproval')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border shadow-sm transition-colors ${
              activeFilter === 'pendingApproval'
                ? 'bg-primary text-white border-primary'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'
            }`}
          >
            Pending Approval
          </button>
        </div>
      </div>
      
      {/* Scrollable Content - 完全按照 UI 文档 */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-background-light dark:bg-background-dark pb-24">
        {/* Loading State */}
        {loading && <SkeletonList count={5} />}
        
        {/* Error State */}
        {error && !loading && (
          <ErrorState message={error} onRetry={fetchEvents} />
        )}
        
        {/* Empty State */}
        {!loading && !error && events.length === 0 && (
          <EmptyState
            icon="event"
            title="No Events Found"
            description={searchQuery ? 'Try a different search term.' : 'No events found with the current filters.'}
          />
        )}
        
        {/* Events List */}
        {!loading && !error && events.length > 0 && events.map((event) => (
          <div
            key={event.id}
            className="bg-white dark:bg-[#1f2937] rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm"
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{event.title}</h3>
                {getStatusBadge(event)}
              </div>
              
              {/* Merchant & Region */}
              <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-4">
                <span className="material-symbols-outlined text-[16px] mr-1">storefront</span>
                <span className="font-medium mr-2">{event.merchant.name}</span>
                <span className="text-slate-300 dark:text-slate-600 mr-2">|</span>
                <span>{event.venue.region.name}</span>
              </div>
              
              {/* Metrics Grid - 完全按照 UI 文档 */}
              <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700/50">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Price</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{event.stats.priceFormatted}</span>
                </div>
                <div className="flex flex-col border-l border-slate-100 dark:border-slate-700/50 pl-3">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Sold</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{event.stats.totalSold.toLocaleString()}</span>
                </div>
                <div className="flex flex-col border-l border-slate-100 dark:border-slate-700/50 pl-3">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Redemp</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{event.stats.redemptionRate}%</span>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center justify-between pt-3 mt-1">
                <Link
                  href={`/events/${event.id}`}
                  className="text-primary dark:text-blue-400 text-sm font-semibold hover:underline decoration-2 underline-offset-4 decoration-primary/30"
                >
                  View Details
                </Link>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEditPricing(event.id)}
                    className="flex items-center justify-center h-8 px-3 rounded bg-primary text-white text-xs font-medium hover:bg-slate-700 transition-colors shadow-sm"
                  >
                    Edit Pricing
                  </button>
                  <button className="flex items-center justify-center size-8 rounded bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600">
                    <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </main>
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={0} />
      
      {/* Edit Pricing Modal */}
      {showPricingModal && selectedEvent && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPricingModal(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark rounded-t-2xl shadow-2xl max-w-[480px] mx-auto p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-primary dark:text-white">Edit Pricing - {selectedEvent.title}</h2>
              <button
                onClick={() => setShowPricingModal(false)}
                className="text-gray-400 hover:text-primary dark:hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ticket Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={pricingForm.ticketTypeId}
                  onChange={(e) => {
                    const type = ticketTypes.find((t) => t.id === e.target.value);
                    setPricingForm({
                      ...pricingForm,
                      ticketTypeId: e.target.value,
                      priceCents: type?.price_cents || 0,
                      inventoryLimit: type?.inventory_limit || 0,
                    });
                  }}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">Select Ticket Type</option>
                  {ticketTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} - ${(type.price_cents / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Price (Cents)
                </label>
                <input
                  type="number"
                  value={pricingForm.priceCents}
                  onChange={(e) => setPricingForm({ ...pricingForm, priceCents: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Current: ${(pricingForm.priceCents / 100).toFixed(2)}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Inventory Limit
                </label>
                <input
                  type="number"
                  value={pricingForm.inventoryLimit}
                  onChange={(e) => setPricingForm({ ...pricingForm, inventoryLimit: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={pricingForm.reason}
                  onChange={(e) => setPricingForm({ ...pricingForm, reason: e.target.value })}
                  placeholder="Please provide a reason for this pricing change..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowPricingModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitPricing}
                  disabled={updatingPricing || !pricingForm.ticketTypeId || !pricingForm.reason.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {updatingPricing ? 'Updating...' : 'Update Pricing'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
