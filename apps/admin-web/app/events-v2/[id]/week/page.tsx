/**
 * Admin Weekly Ticket Configuration Page - Step 2
 * 周票务配置（7天循环配置）
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
// import { toast } from 'sonner'; // Assuming sonner is installed or falling back to alert
import AdminBottomNav from '@/components/admin/AdminBottomNav';

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

export default function WeekConfigPage() {
  console.log('[HIT] V2 events-v2/[id]/week');
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [days, setDays] = useState<Record<number, DayUI>>({});
  const [weekStartDate, setWeekStartDate] = useState<string>(''); // Store week_start_date
  
  // Fetch Config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`/api/admin/events-v2/${eventId}/week`);
        const json = await res.json();
        
        if (json.week_start_date) {
            setWeekStartDate(json.week_start_date);
        }

        if (!json.days) {
          // Initialize default empty week
          const initialDays: Record<number, DayUI> = {};
          [0, 1, 2, 3, 4, 5, 6].forEach(dow => {
            initialDays[dow] = {
              dow,
              enabled: false,
              startTime: '22:00',
              endTime: '02:00',
              endNextDay: true,
              tickets: []
            };
          });
          setDays(initialDays);
        } else {
          // Map DB to UI
          const loadedDays: Record<number, DayUI> = {};
          // Initialize defined days
          (json.days as any[]).forEach((d: any) => {
             loadedDays[d.dow] = {
               dow: d.dow,
               enabled: d.enabled,
               startTime: d.start_time,
               endTime: d.end_time,
               endNextDay: d.end_next_day,
               tickets: (d.tickets || []).map((t: any) => ({
                 id: t.id,
                 tempId: Math.random().toString(36).substr(2, 9),
                 name: t.name,
                 // Map DB category to UI category
                 category: mapDbCategoryToUi(t.category),
                 priceDollars: (t.price_cents / 100).toFixed(2),
                 age: t.min_age === 18 ? '18' : t.min_age === 21 ? '21' : 'ALL',
                 quantity: t.inventory_limit === null ? '' : t.inventory_limit.toString(),
                 status: t.status
               }))
             };
          });
          // Fill missing days
          [0, 1, 2, 3, 4, 5, 6].forEach(dow => {
            if (!loadedDays[dow]) {
              loadedDays[dow] = {
                dow,
                enabled: false,
                startTime: '22:00',
                endTime: '02:00',
                endNextDay: true,
                tickets: []
              };
            }
          });
          setDays(loadedDays);
        }
      } catch (err) {
        console.error('Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [eventId]);

  const mapDbCategoryToUi = (dbCat: string): TicketCategory => {
    switch (dbCat) {
      case 'entry': return 'General';
      case 'vip': return 'VIP';
      case 'drink': return 'Drink';
      case 'skipline': return 'Skip';
      default: return 'Custom';
    }
  };

  const mapUiCategoryToDb = (uiCat: TicketCategory): string => {
    switch (uiCat) {
      case 'General': return 'entry';
      case 'VIP': return 'vip';
      case 'Drink': return 'drink';
      case 'Skip': return 'skipline';
      default: return 'other';
    }
  };

  // --- Actions ---

  const handleDayChange = (dow: number, updates: Partial<DayUI>) => {
    setDays(prev => ({
      ...prev,
      [dow]: { ...prev[dow], ...updates }
    }));
    setIsDirty(true);
  };

  const addTicket = (dow: number) => {
    const newTicket: TicketUI = {
      tempId: Math.random().toString(36).substr(2, 9),
      category: 'General',
      ...DEFAULT_TICKET_TEMPLATES['General'] as any
    };
    const day = days[dow];
    handleDayChange(dow, { tickets: [...day.tickets, newTicket] });
  };

  const updateTicket = (dow: number, ticketIndex: number, updates: Partial<TicketUI>) => {
    const day = days[dow];
    const newTickets = [...day.tickets];
    newTickets[ticketIndex] = { ...newTickets[ticketIndex], ...updates };
    
    // Apply template defaults if category changed
    if (updates.category) {
       const template = DEFAULT_TICKET_TEMPLATES[updates.category];
       newTickets[ticketIndex] = { ...newTickets[ticketIndex], ...template, category: updates.category };
    }

    handleDayChange(dow, { tickets: newTickets });
  };

  const deleteTicket = (dow: number, ticketIndex: number) => {
    const day = days[dow];
    const newTickets = day.tickets.filter((_, i) => i !== ticketIndex);
    handleDayChange(dow, { tickets: newTickets });
  };

  const duplicateTicket = (dow: number, ticketIndex: number) => {
     const day = days[dow];
     const source = day.tickets[ticketIndex];
     const copy: TicketUI = {
       ...source,
       id: undefined, // New ID
       tempId: Math.random().toString(36).substr(2, 9),
       name: `${source.name} (Copy)`
     };
     handleDayChange(dow, { tickets: [...day.tickets, copy] });
  };

  // --- Global Toolbar Actions ---

  const copyDayToAll = () => {
    // Determine active day (assuming first visible or user selection? Let's use Monday as source or current scrolling? User spec didn't specify source. Let's assume we copy the *first enabled day* found to all others, OR simpler: Copy Monday to all.)
    // Better UX: Which day is being edited? 
    // Implementation: Since we don't track "focused" day, let's pick the first enabled day in DAY_ORDER.
    const sourceDow = DAY_ORDER.find(d => days[d]?.enabled) ?? 1; // Default Mon
    const source = days[sourceDow];
    
    if (!confirm(`Overwrite all days with ${DAY_LABELS[sourceDow]}'s configuration?`)) return;

    const newDays = { ...days };
    [0, 1, 2, 3, 4, 5, 6].forEach(d => {
      if (d === sourceDow) return;
      newDays[d] = {
        ...newDays[d],
        enabled: source.enabled, // Copy enabled status too? Usually yes.
        startTime: source.startTime,
        endTime: source.endTime,
        endNextDay: source.endNextDay,
        tickets: source.tickets.map(t => ({...t, id: undefined, tempId: Math.random().toString(36).substr(2,9)})) // Deep copy tickets
      };
    });
    setDays(newDays);
    setIsDirty(true);
  };

  const duplicateTicketsOnly = () => {
    const sourceDow = DAY_ORDER.find(d => days[d]?.enabled && days[d]?.tickets.length > 0) ?? 1;
    const source = days[sourceDow];
    
    if (!confirm(`Copy tickets from ${DAY_LABELS[sourceDow]} to all enabled days?`)) return;

    const newDays = { ...days };
    [0, 1, 2, 3, 4, 5, 6].forEach(d => {
       if (d === sourceDow) return;
       // Only copy to enabled days? Or all? "Duplicate Tickets Only" usually implies merging or overwriting tickets.
       // Let's overwrite tickets for enabled days.
       if (newDays[d].enabled) {
          newDays[d].tickets = source.tickets.map(t => ({...t, id: undefined, tempId: Math.random().toString(36).substr(2,9)}));
       }
    });
    setDays(newDays);
    setIsDirty(true);
  };

  const resetToDefault = () => {
    if (!confirm('Reset all days to default configuration?')) return;
    const initialDays: Record<number, DayUI> = {};
      [0, 1, 2, 3, 4, 5, 6].forEach(dow => {
        initialDays[dow] = {
          dow,
          enabled: false,
          startTime: '22:00',
          endTime: '02:00',
          endNextDay: true,
          tickets: []
        };
      });
      setDays(initialDays);
      setIsDirty(true);
  };

  // --- Save ---

  const handleSave = async () => {
    // Validation
    for (const dow of DAY_ORDER) {
      const day = days[dow];
      if (day.enabled) {
        const activeTickets = day.tickets.filter(t => t.status === 'active');
        if (activeTickets.length === 0) {
          alert(`${DAY_LABELS[dow]} is enabled but has no active tickets. Please add at least one active ticket.`);
          return;
        }
      }
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
            id: t.id, // Pass ID if updating
            name: t.name,
            category: mapUiCategoryToDb(t.category),
            price_cents: Math.round(parseFloat(t.priceDollars) * 100),
            min_age: t.age === 'ALL' ? null : parseInt(t.age),
            inventory_limit: t.quantity === '' ? null : parseInt(t.quantity),
            status: t.status,
            action: 'upsert' // Current logic implies full replace of tickets or smart diff. V2 API handles this.
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
      alert('Changes saved successfully!');
      // Force reload to get new IDs
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
    <div className="bg-[#f6f6f8] dark:bg-[#101022] text-slate-900 dark:text-white font-sans min-h-screen">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-[#111118]/95 backdrop-blur-md border-b border-[#343445] shadow-xl">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <Link href="/events-v2" className="text-white flex items-center justify-center p-2 -ml-2 rounded-full hover:bg-white/10 transition">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <div className="text-white text-base font-bold tracking-tight text-center">
            Weekly Ticket Configuration
          </div>
          <div className="flex flex-col items-end">
            {isDirty && <span className="text-[10px] text-orange-400 font-medium mb-0.5 mr-1">Unsaved changes</span>}
            <button 
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={`bg-[#1313ec] hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-lg shadow-blue-900/20 disabled:opacity-50 ${!isDirty && 'invisible'}`}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
        
        <div className="px-4 pb-3">
          <p className="text-[11px] text-[#9d9db9] leading-tight text-center max-w-md mx-auto">
            This configuration applies continuously until you change it. Changes take effect immediately.
          </p>
        </div>

        {/* Toolbar */}
        <div className="px-4 pb-3 border-t border-[#343445]/50 pt-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={copyDayToAll} className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] border border-[#343445] active:bg-[#1313ec]/20 transition hover:bg-white/5">
              <span className="material-symbols-outlined text-[#1313ec] text-[18px]">calendar_view_week</span>
              <span className="text-xs font-medium text-white whitespace-nowrap">Copy Day to All Days</span>
            </button>
            <button onClick={duplicateTicketsOnly} className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] border border-[#343445] active:bg-[#1313ec]/20 transition hover:bg-white/5">
              <span className="material-symbols-outlined text-white text-[18px]">content_copy</span>
              <span className="text-xs font-medium text-white whitespace-nowrap">Duplicate Tickets Only</span>
            </button>
            <button onClick={resetToDefault} className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] border border-[#343445] active:bg-[#1313ec]/20 transition hover:bg-white/5">
              <span className="material-symbols-outlined text-[#9d9db9] text-[18px]">restart_alt</span>
              <span className="text-xs font-medium text-[#9d9db9] whitespace-nowrap">Reset to Default</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4 pb-24 max-w-lg mx-auto">
        {DAY_ORDER.map(dow => {
          const day = days[dow];
          const isClosed = !day.enabled;
          const hasNoTickets = day.enabled && day.tickets.length === 0;

          return (
            <div 
              key={dow} 
              className={`bg-[#181824] rounded-xl border border-[#343445] overflow-hidden shadow-sm transition-all
                ${isClosed ? 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0' : ''}
                ${hasNoTickets ? 'border-yellow-700/50' : ''}
              `}
            >
              {/* Day Header */}
              <div className={`p-4 ${isClosed ? '' : 'border-b border-[#343445] bg-[#1c1c27]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col">
                    <h3 className="text-white text-lg font-bold leading-tight">{DAY_LABELS[dow]}</h3>
                    <span className={`text-xs ${hasNoTickets ? 'text-yellow-500 font-medium flex items-center gap-1' : 'text-[#9d9db9]'}`}>
                      {isClosed ? 'Closed' : hasNoTickets ? (
                        <><span className="material-symbols-outlined text-[14px]">warning</span> 0 Tickets configured</>
                      ) : (
                        `${day.tickets.filter(t=>t.status==='active').length} Tickets Active`
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isClosed && (
                      <button onClick={() => addTicket(dow)} className="h-8 w-8 flex items-center justify-center rounded-full bg-[#232333] text-[#1313ec] hover:bg-[#1313ec] hover:text-white transition border border-[#343445]">
                        <span className="material-symbols-outlined text-[20px]">add</span>
                      </button>
                    )}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={day.enabled}
                        onChange={(e) => handleDayChange(dow, { enabled: e.target.checked })}
                        className="sr-only peer" 
                      />
                      <div className="w-10 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1313ec]"></div>
                    </label>
                  </div>
                </div>

                {/* Time Controls */}
                {!isClosed && (
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <div className="relative">
                      <span className="absolute left-2 top-1.5 text-[10px] text-[#9d9db9] uppercase font-bold tracking-wider">Start</span>
                      <input 
                        type="time" 
                        value={day.startTime}
                        onChange={(e) => handleDayChange(dow, { startTime: e.target.value })}
                        className="w-full bg-[#232333] border border-[#343445] rounded-lg text-white text-sm px-2 pt-5 pb-1 focus:ring-1 focus:ring-[#1313ec] focus:border-[#1313ec]" 
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1.5 text-[10px] text-[#9d9db9] uppercase font-bold tracking-wider">End</span>
                      <input 
                        type="time" 
                        value={day.endTime}
                        onChange={(e) => handleDayChange(dow, { endTime: e.target.value })}
                        className="w-full bg-[#232333] border border-[#343445] rounded-lg text-white text-sm px-2 pt-5 pb-1 focus:ring-1 focus:ring-[#1313ec] focus:border-[#1313ec]" 
                      />
                    </div>
                    <div className="flex flex-col items-center justify-center bg-[#232333] border border-[#343445] rounded-lg h-full px-2 w-[52px]" title="Ends Next Day">
                      <span className="text-[10px] text-[#9d9db9] font-bold leading-none mb-1">+1D</span>
                      <input 
                        type="checkbox" 
                        checked={day.endNextDay}
                        onChange={(e) => handleDayChange(dow, { endNextDay: e.target.checked })}
                        className="rounded border-[#343445] bg-transparent text-[#1313ec] focus:ring-0 w-4 h-4" 
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Tickets List */}
              {day.enabled && (
                hasNoTickets ? (
                  <div className="bg-yellow-900/20 p-4 flex flex-col items-center justify-center gap-2 min-h-[100px]">
                    <span className="material-symbols-outlined text-yellow-500 text-[32px]">warning</span>
                    <p className="text-sm text-yellow-200/80 text-center">Day is enabled but has no tickets.</p>
                    <button onClick={() => addTicket(dow)} className="text-[#1313ec] text-sm font-bold hover:underline">Add First Ticket</button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col divide-y divide-[#343445]">
                      {day.tickets.map((ticket, tIdx) => (
                        <div key={ticket.tempId} className="p-4 hover:bg-white/[0.02] transition group">
                          <div className="flex flex-col gap-3">
                            {/* Top Row: Category + Name */}
                            <div className="flex gap-2">
                              <div className="w-1/3 min-w-[90px]">
                                <select 
                                  value={ticket.category}
                                  onChange={(e) => updateTicket(dow, tIdx, { category: e.target.value as TicketCategory })}
                                  className="w-full bg-[#232333] border border-[#343445] rounded-lg text-white text-xs py-2 px-2 focus:ring-[#1313ec] focus:border-[#1313ec] appearance-none"
                                >
                                  <option value="General">General</option>
                                  <option value="VIP">VIP</option>
                                  <option value="Drink">Drink</option>
                                  <option value="Skip">Skip Line</option>
                                  <option value="Custom">Custom</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <input 
                                  type="text" 
                                  value={ticket.name}
                                  onChange={(e) => updateTicket(dow, tIdx, { name: e.target.value })}
                                  className="w-full bg-[#232333] border border-[#343445] rounded-lg text-white text-sm py-1.5 px-3 focus:ring-[#1313ec] focus:border-[#1313ec] font-medium" 
                                />
                              </div>
                            </div>

                            {/* Middle Row: Price, Age, Qty */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9d9db9] text-xs">$</span>
                                <input 
                                  type="number" 
                                  value={ticket.priceDollars}
                                  onChange={(e) => updateTicket(dow, tIdx, { priceDollars: e.target.value })}
                                  className="w-full bg-[#232333] border border-[#343445] rounded-lg text-white text-sm py-1.5 pl-5 pr-2 focus:ring-[#1313ec] focus:border-[#1313ec] text-right font-mono" 
                                />
                              </div>
                              <select 
                                value={ticket.age}
                                onChange={(e) => updateTicket(dow, tIdx, { age: e.target.value as AgeRestriction })}
                                className="w-full bg-[#232333] border border-[#343445] rounded-lg text-white text-xs py-1.5 px-2 focus:ring-[#1313ec] focus:border-[#1313ec]"
                              >
                                <option value="ALL">All Ages</option>
                                <option value="18">18+</option>
                                <option value="21">21+</option>
                              </select>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  value={ticket.quantity}
                                  onChange={(e) => updateTicket(dow, tIdx, { quantity: e.target.value })}
                                  className="w-full bg-[#232333] border border-[#343445] rounded-lg text-white text-sm py-1.5 px-2 focus:ring-[#1313ec] focus:border-[#1313ec] text-center placeholder:text-xl font-mono" 
                                  placeholder="∞" 
                                />
                                <span className="absolute right-1 top-0 text-[9px] text-[#9d9db9] bg-[#232333] px-1 -mt-1.5">Qty</span>
                              </div>
                            </div>
                            
                            {/* Bottom Row: Status + Actions */}
                            <div className="flex items-center justify-between mt-1">
                              <div className="flex items-center gap-2">
                                <span className={`flex h-2 w-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] ${ticket.status === 'active' ? 'bg-green-500' : ticket.status === 'sold_out' ? 'bg-red-500' : 'bg-gray-500'}`}></span>
                                <select
                                  value={ticket.status}
                                  onChange={(e) => updateTicket(dow, tIdx, { status: e.target.value as TicketStatus })}
                                  className="bg-transparent text-xs font-medium text-white border-none focus:ring-0 p-0 cursor-pointer"
                                  style={{ color: ticket.status === 'active' ? '#4ade80' : ticket.status === 'sold_out' ? '#f87171' : '#9ca3af' }}
                                >
                                  <option value="active">Active</option>
                                  <option value="sold_out">Sold Out</option>
                                  <option value="hidden">Hidden</option>
                                </select>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => duplicateTicket(dow, tIdx)} className="p-1.5 text-[#9d9db9] hover:text-white hover:bg-white/10 rounded-md transition" title="Duplicate">
                                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
                                </button>
                                <button onClick={() => deleteTicket(dow, tIdx)} className="p-1.5 text-[#9d9db9] hover:text-red-400 hover:bg-red-400/10 rounded-md transition" title="Delete">
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Add Ticket Footer Button */}
                    <button 
                      onClick={() => addTicket(dow)}
                      className="w-full py-3 flex items-center justify-center gap-2 text-[#1313ec] hover:bg-[#1313ec]/5 transition border-t border-[#343445] text-sm font-bold"
                    >
                      <span className="material-symbols-outlined text-[20px]">add_circle</span>
                      Add Ticket
                    </button>
                  </>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
