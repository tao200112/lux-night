/**
 * Admin Weekly Ticket Configuration Page - Step 2
 * 周票务配置（7天循环配置）
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
// import { toast } from 'sonner'; // Assuming sonner is installed or falling back to alert
// import AdminBottomNav from '@/components/admin/AdminBottomNav';

// --- Types ---

type TicketCategory = 'General' | 'VIP' | 'Drink' | 'Skip' | 'Custom';
type AgeRestriction = 'ALL' | '18' | '21';
type TicketStatus = 'active' | 'hidden' | 'sold_out';

interface TicketUI {
  id?: string; // DB ID or undefined for new
  tempId: string; // Internal React key
  name: string;
  category: TicketCategory;
  priceDollars: string; // UI input is string
  age: AgeRestriction;
  quantity: string; // "" = unlimited
  status: TicketStatus;
}

interface DayUI {
  dow: number; // 0=Sun, 1=Mon, ..., 6=Sat
  enabled: boolean;
  startTime: string; // "HT:mm"
  endTime: string;   // "HT:mm"
  endNextDay: boolean; // +1D
  tickets: TicketUI[];
}

// --- Constants ---
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon -> Sun
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_TICKET_TEMPLATES: Record<TicketCategory, Partial<TicketUI>> = {
  'General': { name: 'General Admission', priceDollars: '20.00', age: '21', status: 'active', quantity: '' },
  'VIP': { name: 'VIP Entry', priceDollars: '40.00', age: '21', status: 'active', quantity: '100' },
  'Drink': { name: 'Drink Ticket', priceDollars: '10.00', age: '21', status: 'active', quantity: '' },
  'Skip': { name: 'Skip The Line', priceDollars: '30.00', age: 'ALL', status: 'active', quantity: '50' },
  'Custom': { name: 'Special Pass', priceDollars: '0.00', age: '21', status: 'active', quantity: '' },
};

// --- Helpers ---
const mapDbCategoryToUi = (cat: string): TicketCategory => {
    if (!cat) return 'General';
    const c = cat.toLowerCase();
    if (c === 'vip') return 'VIP';
    if (c === 'drink') return 'Drink';
    if (c === 'skipline' || c === 'skip') return 'Skip';
    return 'General';
};

const mapUiCategoryToDb = (cat: TicketCategory): string => {
  if (cat === 'Skip') return 'skipline';
  return cat.toLowerCase(); // 'General' -> 'general', 'VIP' -> 'vip'
};

export default function WeekConfigPage() {
  console.log('[HIT] V2 events-v2/[id]/week');
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // For publish/status actions
  const [isDirty, setIsDirty] = useState(false);
  const [days, setDays] = useState<Record<number, DayUI>>({});
  const [weekStartDate, setWeekStartDate] = useState<string>(''); // Store week_start_date
  const [status, setStatus] = useState<'draft' | 'active' | 'temp_closed' | 'archived'>('draft');
  
  // Event Info State
  const [activeTab, setActiveTab] = useState<'tickets' | 'info'>('tickets');
  const [eventInfo, setEventInfo] = useState({
    title: '',
    subtitle: '',
    description: '',
    posterUrl: '',
    venueName: '',
    venueAddress: ''
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoDirty, setInfoDirty] = useState(false);

  // Fetch Config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [weekRes, infoRes] = await Promise.all([
           fetch(`/api/admin/events-v2/${eventId}/week`),
           fetch(`/api/admin/events-v2/${eventId}`)
        ]);
        
        const json = await weekRes.json();
        const infoJson = await infoRes.json();
        
        console.log('[DEBUG] Configs:', { week: json, info: infoJson });

        if (infoJson.event) {
            const e = infoJson.event;
            setEventInfo({
                title: e.title || '',
                subtitle: '', // Subtitle not supported by V2 schema
                description: e.description || '',
                posterUrl: e.poster_url || '',
                venueName: e.venue?.name || '',
                venueAddress: e.venue?.address || ''
            });
        }

        if (json.week_start_date) {
            setWeekStartDate(json.week_start_date);
        }
        
        if (json.event_status) {
            setStatus(json.event_status);
        }

        const loadedDays: Record<number, DayUI> = {};
        // Initialize all 7 days first
        [0, 1, 2, 3, 4, 5, 6].forEach(dow => {
            loadedDays[dow] = {
                dow,
                enabled: false,
                startTime: '22:00',
                endTime: '02:00',
                endNextDay: true,
                tickets: []
            };
        });

        if (json.days && Object.keys(json.days).length > 0) {
            Object.values(json.days).forEach((d: any) => {
                const dow = d.dow; // DB is 0-6
                const dbTickets = d.tickets || [];
                
                loadedDays[dow] = {
                    dow,
                    enabled: d.enabled,
                    startTime: d.start_time?.slice(0, 5) || '22:00',
                    endTime: d.end_time?.slice(0, 5) || '02:00',
                    endNextDay: d.end_next_day ?? true,
                    tickets: dbTickets.map((t: any) => ({
                        id: t.id,
                        tempId: Math.random().toString(36).substr(2, 9),
                        name: t.name || 'Unnamed Ticket',
                        category: mapDbCategoryToUi(t.category),
                        priceDollars: ((t.price_cents || 0) / 100).toFixed(2),
                        age: t.min_age === 21 ? '21' : t.min_age === 18 ? '18' : 'ALL',
                        quantity: t.inventory_limit === null ? '' : String(t.inventory_limit),
                        status: t.status || 'active'
                    }))
                };
            });
        }
        setDays(loadedDays);

      } catch (err) {
        console.error('Fetch Config Error:', err);
        alert('Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [eventId]);

  // --- Actions ---

  const toggleDayParams = (dow: number, field: keyof DayUI, value: any) => {
    setDays(prev => ({
      ...prev,
      [dow]: { ...prev[dow], [field]: value }
    }));
    setIsDirty(true);
  };

  const addTicket = (dow: number, templateCat: TicketCategory = 'General') => {
    const template = DEFAULT_TICKET_TEMPLATES[templateCat];
    const newTicket: TicketUI = {
      tempId: Math.random().toString(36).substr(2, 9),
      name: template.name || 'New Ticket',
      category: templateCat,
      priceDollars: template.priceDollars || '0.00',
      age: (template.age as AgeRestriction) || '21',
      quantity: template.quantity || '',
      status: 'active',
      ...template // spread remaining
    };

    setDays(prev => ({
      ...prev,
      [dow]: {
        ...prev[dow],
        tickets: [...prev[dow].tickets, newTicket]
      }
    }));
    setIsDirty(true);
  };

  const updateTicket = (dow: number, ticketTempId: string, field: keyof TicketUI, value: any) => {
    setDays(prev => ({
      ...prev,
      [dow]: {
        ...prev[dow],
        tickets: prev[dow].tickets.map(t => 
          t.tempId === ticketTempId ? { ...t, [field]: value } : t
        )
      }
    }));
    setIsDirty(true);
  };

  const removeTicket = (dow: number, ticketTempId: string) => {
    if (!confirm('Delete this ticket?')) return;
    setDays(prev => ({
      ...prev,
      [dow]: {
        ...prev[dow],
        tickets: prev[dow].tickets.filter(t => t.tempId !== ticketTempId)
      }
    }));
    setIsDirty(true);
  };

  const duplicateTicket = (dow: number, ticketTempId: string) => {
      const day = days[dow];
      const source = day.tickets.find(t => t.tempId === ticketTempId);
      if (!source) return;

      const newTicket: TicketUI = {
          ...source,
          id: undefined,
          tempId: Math.random().toString(36).substr(2, 9),
          name: source.name + ' (Copy)'
      };

      setDays(prev => ({
          ...prev,
          [dow]: {
              ...prev[dow],
              tickets: [...prev[dow].tickets, newTicket]
          }
      }));
      setIsDirty(true);
  };


  // --- Status Actions ---

  const handlePublish = async () => {
    if (isDirty) {
        alert('Please save your changes first.');
        return;
    }
    if (!confirm('Ready to publish? This will make the event visible to customers.')) return;

    setIsProcessing(true);
    try {
        const res = await fetch(`/api/admin/events-v2/${eventId}/publish`, { method: 'POST' });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        
        setStatus('active');
        alert('Event Published Successfully!');
        window.location.reload();
    } catch (err: any) {
        alert('Publish Failed: ' + err.message);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
      if (!confirm(`Are you sure you want to change status to ${newStatus}?`)) return;
      setIsProcessing(true);
      try {
          const res = await fetch(`/api/admin/events-v2/${eventId}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus })
          });
          const json = await res.json();
          if (json.error) throw new Error(json.error);
          
          setStatus(newStatus as any);
          alert(`Status changed to ${newStatus}`);
      } catch (e: any) {
          alert(e.message);
      } finally {
          setIsProcessing(false);
      }
  };

  // --- Save ---

  const updateInfo = (field: keyof typeof eventInfo, value: string) => {
      setEventInfo(prev => ({ ...prev, [field]: value }));
      setInfoDirty(true);
  };

  const handleSaveInfo = async () => {
    if (!eventInfo.title.trim()) {
        alert('Title is required');
        return;
    }
    setSavingInfo(true);
    try {
        const res = await fetch(`/api/admin/events-v2/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: eventInfo.title,
                subtitle: eventInfo.subtitle,
                description: eventInfo.description,
                poster_url: eventInfo.posterUrl,
                venue_name: eventInfo.venueName,
                venue_address: eventInfo.venueAddress
            })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        
        setInfoDirty(false);
        alert('Event Info Saved Successfully!');
    } catch (err: any) {
        alert('Failed to save info: ' + err.message);
    } finally {
        setSavingInfo(false);
    }
  };

  // --- Save ---

  const handleSave = async () => {
    // Validation
    let hasEnabledDay = false;
    for (const dow of DAY_ORDER) {
      const day = days[dow];
      if (day && day.enabled) {
        hasEnabledDay = true;
        const activeTickets = day.tickets.filter(t => t.status !== 'hidden'); // Use hidden as 'deleted' effectively?
        if (activeTickets.length === 0) {
          alert(`${DAY_LABELS[dow]} is enabled but has no tickets. Add tickets or disable the day.`);
          return;
        }
      }
    }

    if (!hasEnabledDay && status === 'active') {
        alert('Active events must have at least one enabled day.');
        return;
    }

    setSaving(true);
    try {
      // Prepare Payload
      const daysPayload: Record<string, any> = {};
      Object.values(days).forEach(day => {
        daysPayload[day.dow] = {
          enabled: day.enabled,
          start_time: day.startTime,
          end_time: day.endTime,
          end_next_day: day.endNextDay,
          tickets: day.tickets.map(t => ({
            id: t.id, // If present, it updates
            name: t.name,
            category: mapUiCategoryToDb(t.category),
            price_cents: Math.round(parseFloat(t.priceDollars) * 100),
            currency: 'usd',
            min_age: t.age === 'ALL' ? null : parseInt(t.age),
            inventory_limit: t.quantity === '' ? null : parseInt(t.quantity),
            status: t.status,
            action: 'upsert'
          }))
        };
      });

      const res = await fetch(`/api/admin/events-v2/${eventId}/week`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            week_start_date: weekStartDate,
            days: daysPayload 
        })
      });
      
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setIsDirty(false);
      
      const syncMsg = json.stripe_sync?.status === 'failed' 
          ? `\n\n⚠️ WARNING: Stripe Sync Failed: ${json.stripe_sync.error}\nCheck your STRIPE_KEY settings.`
          : json.stripe_sync?.status === 'success' ? '\n(Stripe Synced ✅)' : '';

      alert('Changes saved successfully!' + syncMsg);
      window.location.reload(); 

    } catch (err: any) {
      console.error('Save failed:', err);
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };


  if (loading) return <div className="min-h-screen bg-[#101022] text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="bg-[#f6f6f8] dark:bg-[#101022] text-slate-900 dark:text-white font-sans min-h-screen pb-32">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-[#111118]/95 backdrop-blur-md border-b border-[#343445] shadow-xl">
        <div className="flex items-center justify-between px-4 pt-3 pb-3">
          <Link href="/events-v2" className="text-white flex items-center justify-center p-2 -ml-2 rounded-full hover:bg-white/10 transition">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          
          <div className="flex flex-col items-center">
             <div className="text-white text-base font-bold tracking-tight text-center">
               Weekly Ticket Configuration
             </div>
             {/* Status Badge & Actions */}
             <div className="flex items-center gap-3 mt-1.5">
                <div className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    status === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                    status === 'temp_closed' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                    status === 'archived' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    'bg-gray-500/20 text-gray-400 border-gray-500/30'
                }`}>
                    {status ? status.replace('_', ' ') : 'DRAFT'}
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2">
                    {status === 'draft' && (
                        <button 
                            onClick={handlePublish}
                            disabled={isProcessing}
                            className="flex items-center gap-1 bg-[#1313ec] hover:bg-[#1313ec]/80 text-white text-[10px] font-bold px-2.5 py-1 rounded border border-[#1313ec] shadow-sm transition-all active:scale-95"
                        >
                            <span>Publish Event</span>
                            <span className="material-symbols-outlined text-[12px]">rocket_launch</span>
                        </button>
                    )}
                    {status === 'active' && (
                        <button 
                             onClick={() => handleStatusChange('temp_closed')}
                             disabled={isProcessing}
                             className="text-[10px] font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 px-2.5 py-1 rounded border border-yellow-500/30 transition-all"
                        >
                            Close Temporarily
                        </button>
                    )}
                    {status === 'temp_closed' && (
                        <button 
                             onClick={() => handleStatusChange('active')}
                             disabled={isProcessing}
                             className="text-[10px] font-medium bg-green-500/10 hover:bg-green-500/20 text-green-400 px-2.5 py-1 rounded border border-green-500/30 transition-all"
                        >
                            Re-open
                        </button>
                    )}
                    {(status === 'active' || status === 'temp_closed') && (
                        <button 
                             onClick={() => handleStatusChange('archived')}
                             disabled={isProcessing}
                             className="text-[10px] font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2.5 py-1 rounded border border-red-500/30 transition-all"
                        >
                            Archive
                        </button>
                    )}
                </div>
             </div>
             
             {/* Tabs */}
             <div className="flex items-center gap-1 mt-3 bg-[#181820] p-1 rounded-lg border border-[#333]">
                <button 
                    onClick={() => setActiveTab('tickets')}
                    className={`text-xs font-bold px-4 py-1.5 rounded-md transition-all ${activeTab === 'tickets' ? 'bg-[#1313ec] text-white shadow-sm' : 'text-[#888] hover:text-white'}`}
                >
                    Tickets
                </button>
                <button 
                    onClick={() => setActiveTab('info')}
                    className={`text-xs font-bold px-4 py-1.5 rounded-md transition-all ${activeTab === 'info' ? 'bg-[#1313ec] text-white shadow-sm' : 'text-[#888] hover:text-white'}`}
                >
                    Event Info
                </button>
             </div>
          </div>

          <div className="flex flex-col items-end">
             {(activeTab === 'tickets' ? isDirty : infoDirty) && <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider mb-1 block">Unsaved changes</span>}
             {activeTab === 'tickets' ? (
                 <button
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className={`bg-[#1313ec] hover:bg-[#1313ec]/90 text-white font-bold py-1.5 px-4 rounded transition-all flex items-center gap-2 ${saving || !isDirty ? 'opacity-70 cursor-not-allowed' : ''}`}
                 >
                    {saving ? 'Saving...' : 'Save Tickets'}
                 </button>
             ) : (
                 <button
                    onClick={handleSaveInfo}
                    disabled={savingInfo || !infoDirty}
                    className={`bg-[#1313ec] hover:bg-[#1313ec]/90 text-white font-bold py-1.5 px-4 rounded transition-all flex items-center gap-2 ${savingInfo || !infoDirty ? 'opacity-70 cursor-not-allowed' : ''}`}
                 >
                    {savingInfo ? 'Saving...' : 'Save Event Info'}
                 </button>
             )}
          </div>
        </div>
      </div>

       <div className="p-4 max-w-2xl mx-auto">
         
         {activeTab === 'info' && (
             <div className="bg-[#15151A] rounded-xl border border-[#333] p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Title & Subtitle */}
                  <div className="grid grid-cols-1 gap-4">
                      <div>
                          <label className="text-xs text-[#888] uppercase font-bold block mb-1.5">Event Title <span className="text-red-400">*</span></label>
                          <input 
                              type="text" 
                              value={eventInfo.title}
                              onChange={(e) => updateInfo('title', e.target.value)}
                              className="w-full bg-[#0A0A0E] border border-[#333] rounded-lg px-3 py-2 text-white placeholder-white/20 focus:border-[#1313ec] focus:outline-none transition-colors"
                              placeholder="e.g. Friday Night Magic"
                          />
                      </div>
                      <div>
                          <label className="text-xs text-[#888] uppercase font-bold block mb-1.5">Subtitle</label>
                          <input 
                              type="text" 
                              value={eventInfo.subtitle}
                              onChange={(e) => updateInfo('subtitle', e.target.value)}
                              className="w-full bg-[#0A0A0E] border border-[#333] rounded-lg px-3 py-2 text-white placeholder-white/20 focus:border-[#1313ec] focus:outline-none transition-colors"
                              placeholder="e.g. Special Guest DJ"
                          />
                      </div>
                  </div>

                  {/* Description */}
                  <div>
                      <label className="text-xs text-[#888] uppercase font-bold block mb-1.5">Description</label>
                      <textarea 
                          value={eventInfo.description}
                          onChange={(e) => updateInfo('description', e.target.value)}
                          rows={4}
                          className="w-full bg-[#0A0A0E] border border-[#333] rounded-lg px-3 py-2 text-white placeholder-white/20 focus:border-[#1313ec] focus:outline-none transition-colors resize-none"
                          placeholder="Event details..."
                      />
                  </div>

                  {/* Poster */}
                  <div>
                      <label className="text-xs text-[#888] uppercase font-bold block mb-1.5">Poster URL</label>
                      <div className="flex gap-4 items-start">
                          <input 
                              type="text" 
                              value={eventInfo.posterUrl}
                              onChange={(e) => updateInfo('posterUrl', e.target.value)}
                              className="flex-1 bg-[#0A0A0E] border border-[#333] rounded-lg px-3 py-2 text-white placeholder-white/20 focus:border-[#1313ec] focus:outline-none transition-colors font-mono text-xs"
                              placeholder="https://..."
                          />
                          {eventInfo.posterUrl && (
                              <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-[#333] bg-black">
                                  <img src={eventInfo.posterUrl} alt="Poster" className="w-full h-full object-cover" />
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Venue Info */}
                  <div className="pt-4 border-t border-[#333]">
                      <h4 className="text-sm font-bold text-white mb-4">Venue Details</h4>
                      <div className="grid grid-cols-1 gap-4">
                          <div>
                              <label className="text-xs text-[#888] uppercase font-bold block mb-1.5">Venue Name</label>
                              <input 
                                  type="text" 
                                  value={eventInfo.venueName}
                                  onChange={(e) => updateInfo('venueName', e.target.value)}
                                  className="w-full bg-[#0A0A0E] border border-[#333] rounded-lg px-3 py-2 text-white placeholder-white/20 focus:border-[#1313ec] focus:outline-none transition-colors"
                                  placeholder="e.g. Club Space"
                              />
                          </div>
                          <div>
                              <label className="text-xs text-[#888] uppercase font-bold block mb-1.5">Address</label>
                              <input 
                                  type="text" 
                                  value={eventInfo.venueAddress}
                                  onChange={(e) => updateInfo('venueAddress', e.target.value)}
                                  className="w-full bg-[#0A0A0E] border border-[#333] rounded-lg px-3 py-2 text-white placeholder-white/20 focus:border-[#1313ec] focus:outline-none transition-colors"
                                  placeholder="e.g. 34 NE 11th St"
                              />
                          </div>
                      </div>
                  </div>
             </div>
         )}
        
        {activeTab === 'tickets' && (
         <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Helper Actions */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {/* Can add Copy/Paste logic here later */}
            </div>
    
            {DAY_ORDER.map((dow) => {
          const day = days[dow];
          if (!day) return null; // Safety
          
          return (
            <div key={dow} className={`rounded-xl border transition-all duration-200 ${day.enabled ? 'bg-[#181820] border-[#1313ec]/50 shadow-[0_0_20px_rgba(19,19,236,0.1)]' : 'bg-[#111116] border-[#22222a] opacity-80'}`}>
              
              {/* Day Header */}
              <div className="p-4 flex items-center justify-between border-b border-white/5">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {DAY_LABELS[dow]}
                    </h3>
                    {day.enabled && (
                        <div className="text-xs text-[#666666] mt-0.5">
                            {day.tickets.filter(t => t.status === 'active').length} Tickets Active
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-3">
                   <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={day.enabled} onChange={(e) => toggleDayParams(dow, 'enabled', e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1313ec]"></div>
                    </label>
                </div>
              </div>

              {day.enabled && (
                  <div className="p-4 space-y-4">
                      {/* Time Config */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-[#0A0A0E] rounded-lg p-2 border border-[#333] flex items-center justify-between">
                            <div className="text-[10px] text-[#666] uppercase font-bold px-1">Start</div>
                            <input 
                                type="time" 
                                value={day.startTime}
                                onChange={(e) => toggleDayParams(dow, 'startTime', e.target.value)}
                                className="bg-transparent text-white text-sm font-mono focus:outline-none text-right w-full"
                            />
                        </div>
                        <div className="bg-[#0A0A0E] rounded-lg p-2 border border-[#333] flex items-center justify-between">
                            <div className="text-[10px] text-[#666] uppercase font-bold px-1">End</div>
                            <input 
                                type="time" 
                                value={day.endTime}
                                onChange={(e) => toggleDayParams(dow, 'endTime', e.target.value)}
                                className="bg-transparent text-white text-sm font-mono focus:outline-none text-right w-full"
                            />
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-2">
                             <label className="text-xs text-[#888] flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={day.endNextDay}
                                    onChange={(e) => toggleDayParams(dow, 'endNextDay', e.target.checked)}
                                    className="rounded border-gray-600 bg-[#222] text-[#1313ec] focus:ring-0"
                                />
                                Ends next day (+1D)
                             </label>
                        </div>
                      </div>
                      
                      {/* Divider */}
                      <div className="h-[1px] bg-white/5 w-full my-4"></div>

                      {/* Tickets List */}
                      <div className="space-y-3">
                         {day.tickets.map((ticket, tIdx) => (
                             <div key={ticket.tempId} className="bg-[#15151A] rounded-lg border border-[#333] p-3 group hover:border-[#555] transition-colors relative">
                                 <div className="grid grid-cols-12 gap-3 mb-2">
                                     <div className="col-span-8">
                                         <label className="text-[10px] text-[#555] uppercase font-bold block mb-1">Ticket Name</label>
                                         <input 
                                            type="text" 
                                            value={ticket.name}
                                            onChange={(e) => updateTicket(dow, ticket.tempId, 'name', e.target.value)}
                                            className="w-full bg-[#0A0A0E] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:border-[#1313ec] focus:outline-none"
                                            placeholder="e.g. Early Bird"
                                         />
                                     </div>
                                     <div className="col-span-4">
                                          <label className="text-[10px] text-[#555] uppercase font-bold block mb-1">Price ($)</label>
                                          <input 
                                            type="number" 
                                            value={ticket.priceDollars}
                                            onChange={(e) => updateTicket(dow, ticket.tempId, 'priceDollars', e.target.value)}
                                            className="w-full bg-[#0A0A0E] border border-[#333] rounded px-2 py-1.5 text-sm text-white font-mono text-right focus:border-[#1313ec] focus:outline-none"
                                            placeholder="0.00"
                                         />
                                     </div>
                                 </div>
                                 
                                 <div className="grid grid-cols-3 gap-2">
                                      <div>
                                          <select 
                                            value={ticket.age}
                                            onChange={(e) => updateTicket(dow, ticket.tempId, 'age', e.target.value)}
                                            className="w-full bg-[#0A0A0E] border border-[#333] rounded px-2 py-1.5 text-xs text-[#aaa] focus:border-[#1313ec] focus:outline-none"
                                          >
                                              <option value="21">21+</option>
                                              <option value="18">18+</option>
                                              <option value="ALL">All Ages</option>
                                          </select>
                                      </div>
                                      <div>
                                          <input 
                                            type="number" 
                                            value={ticket.quantity}
                                            onChange={(e) => updateTicket(dow, ticket.tempId, 'quantity', e.target.value)}
                                            className="w-full bg-[#0A0A0E] border border-[#333] rounded px-2 py-1.5 text-xs text-[#aaa] focus:border-[#1313ec] focus:outline-none"
                                            placeholder="∞ Qty"
                                          />
                                      </div>
                                      <div>
                                           <select 
                                            value={ticket.status}
                                            onChange={(e) => updateTicket(dow, ticket.tempId, 'status', e.target.value)}
                                            className={`w-full bg-[#0A0A0E] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-[#1313ec] focus:outline-none ${ticket.status === 'active' ? 'text-green-400' : 'text-gray-500'}`}
                                          >
                                              <option value="active">Active</option>
                                              <option value="sold_out">Sold Out</option>
                                              <option value="hidden">Hidden</option>
                                          </select>
                                      </div>
                                 </div>

                                 {/* Action Buttons */}
                                 <div className="flex items-center gap-1 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all">
                                     <button 
                                        onClick={() => duplicateTicket(dow, ticket.tempId)}
                                        className="bg-[#222] text-[#888] hover:text-white hover:bg-[#333] rounded-md p-1 border border-[#444]"
                                        title="Duplicate"
                                     >
                                        <span className="material-symbols-outlined text-[14px] block">content_copy</span>
                                     </button>
                                     <button 
                                        onClick={() => removeTicket(dow, ticket.tempId)}
                                        className="bg-[#222] text-[#888] hover:text-red-400 hover:bg-[#333] rounded-md p-1 border border-[#444]"
                                        title="Delete"
                                     >
                                        <span className="material-symbols-outlined text-[14px] block">close</span>
                                     </button>
                                 </div>
                             </div>
                         ))}
                      </div>

                      {/* Quick Add Actions */}
                      <div className="pt-2">
                          <label className="text-[10px] text-[#666] uppercase font-bold block mb-2 text-center">Quick Add Ticket</label>
                          <div className="flex flex-wrap gap-2 justify-center">
                              <button onClick={() => addTicket(dow, 'General')} className="px-3 py-1 bg-[#1e1e24] hover:bg-[#25252d] border border-[#333] rounded-full text-xs text-[#ccc] transition-colors">
                                  + General
                              </button>
                              <button onClick={() => addTicket(dow, 'VIP')} className="px-3 py-1 bg-[#1e1e24] hover:bg-[#25252d] border border-[#333] rounded-full text-xs text-[#ccc] transition-colors">
                                  + VIP
                              </button>
                              <button onClick={() => addTicket(dow, 'Drink')} className="px-3 py-1 bg-[#1e1e24] hover:bg-[#25252d] border border-[#333] rounded-full text-xs text-[#ccc] transition-colors">
                                  + Drink
                              </button>
                              <button onClick={() => addTicket(dow, 'Skip')} className="px-3 py-1 bg-[#1e1e24] hover:bg-[#25252d] border border-[#333] rounded-full text-xs text-[#ccc] transition-colors">
                                  + Skip Line
                              </button>
                          </div>
                      </div>
                      
                      {day.tickets.length === 0 && (
                          <div className="text-center py-4 bg-[#141418] rounded-lg border border-dashed border-[#333]">
                                <span className="material-symbols-outlined text-[#444] text-[24px] mb-1">confirmation_number</span>
                                <p className="text-xs text-[#666]">No tickets configured</p>
                          </div>
                      )}

                  </div>
              )}
            </div>
          );
        })}
          </div>
       )}
       </div>
    </div>
  );
}
