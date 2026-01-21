'use client';

import React, { useState, useEffect } from 'react';
import { getRegions, getEvents, Region as RegionType } from '@/lib/data/regions';
import { getEvents as getEventsData, EventWithVenue } from '@/lib/data/events';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BackButton from '../components/ui/BackButton';
import BottomTabBar from '../components/ui/BottomTabBar';

export default function DiscoverPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'bars' | 'events'>('events');
  const [region, setRegion] = useState<RegionType | null>(null);
  const [regions, setRegions] = useState<RegionType[]>([]);
  const [events, setEvents] = useState<EventWithVenue[]>([]);
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    // Redirect to login if not authenticated
    // Use replace instead of push to avoid adding to history stack
    if (!user) {
      router.replace('/login?redirect=' + encodeURIComponent('/'));
      return;
    }

    loadData();
  }, [user, authLoading, router]);

  useEffect(() => {
    if (region) {
      loadEvents();
    }
  }, [region]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load regions
      const regionsData = await getRegions();
      setRegions(regionsData);

      // Load profile region or use first region
      if (profile?.last_region_id) {
        const selectedRegion = regionsData.find(r => r.id === profile.last_region_id);
        if (selectedRegion) {
          setRegion(selectedRegion);
        } else if (regionsData.length > 0) {
          setRegion(regionsData[0]);
        }
      } else if (regionsData.length > 0) {
        setRegion(regionsData[0]);
      } else {
        setError('No regions available');
      }

      // Load region from localStorage as fallback
      if (!region) {
        const savedRegionId = localStorage.getItem('selectedRegionId');
        if (savedRegionId) {
          const savedRegion = regionsData.find(r => r.id === savedRegionId);
          if (savedRegion) {
            setRegion(savedRegion);
          }
        }
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    if (!region) return;

    try {
      setLoading(true);
      const eventsData = await getEventsData(region.id);
      setEvents(eventsData);
    } catch (err: any) {
      console.error('Error loading events:', err);
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleRegionSelect = async (selectedRegion: RegionType) => {
    setRegion(selectedRegion);
    setIsRegionOpen(false);
    
    // Save to localStorage
    localStorage.setItem('selectedRegionId', selectedRegion.id);
    
    // Optionally update profile (if API exists)
    // await updateProfileRegion(user.id, selectedRegion.id);
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="relative w-full max-w-md mx-auto min-h-screen flex flex-col bg-background-light dark:bg-background-dark overflow-hidden shadow-2xl">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="relative w-full max-w-md mx-auto min-h-screen flex flex-col bg-background-light dark:bg-background-dark overflow-hidden shadow-2xl">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <span className="material-symbols-outlined text-4xl text-alert-red mb-4">error</span>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Error loading data</h3>
          <p className="text-sm text-slate-500 dark:text-gray-500 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-primary text-background-dark rounded-lg font-bold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const displayEvents = events;
  const featuredEvent = events.length > 0 ? events[0] : null;

  return (
    <div className="relative w-full max-w-md mx-auto min-h-screen flex flex-col bg-background-light dark:bg-background-dark overflow-hidden shadow-2xl">
      {/* Region Selection Modal - Shown on top when open */}
      {isRegionOpen && (
        <div className="fixed inset-0 z-[60] bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-display min-h-screen flex flex-col relative overflow-hidden antialiased">
          {/* Ambient Background */}
          <div className="fixed top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none z-0"></div>
          <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-blue-900/10 rounded-full blur-[80px] pointer-events-none z-0"></div>
          
          <main className="relative z-10 flex-1 flex flex-col h-full overflow-y-auto no-scrollbar pb-32">
            <header className="pt-8 pb-4 px-6 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[32px] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
                  Choose<br/>your area
                </h2>
                <button
                  onClick={() => setIsRegionOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-slate-900 dark:text-white">close</span>
                </button>
              </div>
            </header>
            
            <section className="px-6 mb-8">
              <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-primary/0 rounded-xl blur opacity-20 group-focus-within:opacity-50 transition duration-500"></div>
                <div className="relative flex items-center w-full h-14 bg-surface-light dark:bg-surface-dark rounded-xl transition-all duration-300 border border-slate-200 dark:border-white/5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50">
                  <div className="pl-4 pr-3 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">search</span>
                  </div>
                  <input 
                    className="w-full bg-transparent border-none focus:ring-0 text-[16px] placeholder-slate-400 dark:placeholder-white/30 text-slate-900 dark:text-white h-full p-0 pr-4 rounded-xl" 
                    placeholder="Search city or region..." 
                    type="text"
                  />
                </div>
              </div>
            </section>
            
            <section className="px-6 mb-10">
              <button className="w-full flex items-center justify-between p-1 pr-4 bg-surface-light dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-white/5 group active:scale-[0.99] transition-all duration-200 hover:shadow-glow hover:border-primary/30">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center size-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary border border-primary/10">
                    <span className="material-symbols-outlined filled">my_location</span>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-base font-bold text-slate-900 dark:text-white">Current Location</span>
                    <span className="text-xs text-slate-500 dark:text-white/40">Use GPS data</span>
                  </div>
                </div>
                <div className="size-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-white/5 group-hover:bg-primary group-hover:text-black transition-colors duration-300">
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </button>
            </section>
            
            <section className="px-6 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-white/30">Recommended</h3>
                <span className="text-xs text-primary cursor-pointer hover:underline">View all</span>
              </div>
              {regions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No regions available</div>
              ) : (
                <div className="flex flex-col space-y-2">
                  {regions.map((r) => (
                    <button 
                      key={r.id}
                      onClick={() => handleRegionSelect(r)}
                      className={`w-full group flex items-center justify-between py-4 px-2 border-b border-slate-200 dark:border-white/5 hover:bg-surface-light/50 dark:hover:bg-white/5 rounded-lg transition-all duration-200 ${r.id === region?.id ? 'bg-primary/5' : ''}`}
                    >
                      <div className="flex flex-col items-start">
                        <span className={`text-xl font-medium ${r.id === region?.id ? 'text-primary' : 'text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors'}`}>{r.name}</span>
                      </div>
                      <span className={`material-symbols-outlined ${r.id === region?.id ? 'text-primary' : 'text-primary/40 group-hover:text-primary group-hover:translate-x-1'} transition-all duration-300`}>chevron_right</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-xl border-b border-black/5 dark:border-white/5 transition-all duration-300">
        {/* Region Selection - Prominently displayed at top */}
        <div className="px-4 py-4 border-b border-black/5 dark:border-white/5">
          <button 
            onClick={() => setIsRegionOpen(true)}
            className="group relative flex items-center justify-center gap-2 bg-primary w-full px-5 py-3 rounded-full shadow-[0_0_15px_rgba(223,181,42,0.3)] active:scale-95 transition-transform duration-200 hover:shadow-[0_0_20px_rgba(223,181,42,0.5)]"
          >
            <span className="material-symbols-outlined text-background-dark text-[20px] font-medium">location_on</span>
            <span className="text-background-dark font-bold text-sm tracking-wide uppercase">
              {region ? `${region.name}` : 'Choose your area'}
            </span>
            <span className="material-symbols-outlined text-background-dark text-[18px]">expand_more</span>
          </button>
        </div>
        
        {/* Tab Switcher */}
        <div className="px-4 pt-2">
          <div className="flex items-end gap-8">
            <button 
              onClick={() => setActiveTab('bars')}
              className={`pb-3 border-b-2 font-bold text-lg leading-none tracking-tight transition-colors ${activeTab === 'bars' ? 'border-primary text-slate-900 dark:text-white' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300'}`}
            >
              Bars
            </button>
            <button 
              onClick={() => setActiveTab('events')}
              className={`pb-3 border-b-2 font-bold text-lg leading-none tracking-tight transition-colors ${activeTab === 'events' ? 'border-primary text-slate-900 dark:text-white' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300'}`}
            >
              Events
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 space-y-0 no-scrollbar">
        {activeTab === 'events' && (
          <>
            {/* Hero Section */}
            {featuredEvent && (
              <section className="px-4 pt-6 pb-8 border-b border-slate-200 dark:border-white/5 bg-gradient-to-b from-transparent to-black/5 dark:to-white/5">
                <div className="flex items-end justify-between mb-5 px-1">
                  <div>
                    <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">Tonight</h2>
                    <p className="text-primary font-bold text-sm mt-1 uppercase tracking-wider flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                      Top Pick for You
                    </p>
                  </div>
                </div>
                
                <Link href={`/events/${featuredEvent.id}`}>
                  <article className="group relative w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-lg transform transition-all hover:shadow-primary/20 cursor-pointer">
                    {featuredEvent.poster_url && (
                      <img alt={featuredEvent.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src={featuredEvent.poster_url}/>
                    )}
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-lux-gradient"></div>
                    {/* Badges */}
                    <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-primary text-background-dark text-xs font-bold uppercase tracking-wider rounded-full shadow-lg">Tonight</span>
                      <span className="px-3 py-1 bg-surface-dark/90 backdrop-blur text-primary border border-primary/30 text-xs font-bold uppercase tracking-wider rounded-full">{featuredEvent.age_policy}</span>
                    </div>
                    {/* Content */}
                    <div className="absolute bottom-0 left-0 w-full p-5 flex flex-col gap-1">
                      <div className="flex justify-between items-end mb-1">
                        <h3 className="text-white text-2xl font-bold leading-tight tracking-tight">{featuredEvent.venue?.name || featuredEvent.title}</h3>
                        <div className="flex items-center gap-1 text-primary">
                          <span className="material-symbols-outlined text-[16px] filled">star</span>
                          <span className="text-sm font-bold">4.9</span>
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm font-medium flex items-center gap-2">
                        <span>0.4 mi</span>
                        <span className="w-1 h-1 rounded-full bg-gray-500"></span>
                        <span>Jazz & Cocktails</span>
                      </p>
                    </div>
                  </article>
                </Link>
              </section>
            )}

            {/* Event List */}
            <section className="px-4 pt-4 pb-2">
              <div className="pt-4 pb-4 flex items-center justify-between">
                <h2 className="text-slate-900 dark:text-white text-lg font-bold">Trending Events</h2>
                <button className="text-primary text-sm font-semibold">View All</button>
              </div>
              {displayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <span className="material-symbols-outlined text-4xl text-gray-500 mb-4">event_busy</span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                    No events found in {region?.name || 'your area'}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-gray-500 mb-4">
                    Try switching your area to see more events.
                  </p>
                  <button
                    onClick={() => setIsRegionOpen(true)}
                    className="px-4 py-2 bg-primary text-background-dark rounded-lg font-bold text-sm active:scale-95 transition-transform"
                  >
                    Change Area
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayEvents.map((event) => (
                    <Link href={`/events/${event.id}`} key={event.id} className="block">
                      <div className="group flex gap-4 p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30 transition-colors">
                        {event.poster_url && (
                          <div className="relative w-20 aspect-[3/4] shrink-0 rounded-lg overflow-hidden">
                            <img alt={event.title} className="w-full h-full object-cover" src={event.poster_url}/>
                          </div>
                        )}
                        <div className="flex-1 flex flex-col justify-center py-1">
                          <h4 className="text-slate-900 dark:text-white font-bold text-lg leading-tight line-clamp-1">{event.title}</h4>
                          <div className="flex items-center gap-2 mt-2 text-slate-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
                            <span className="text-primary">{new Date(event.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                            <span>{new Date(event.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                          </div>
                          <div className="mt-auto pt-2 flex items-center justify-between">
                            <p className="text-slate-400 dark:text-gray-500 text-xs">{event.venue?.address || 'Location TBA'}</p>
                            {/* TODO: Fetch minimum ticket price from ticket_types */}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        
        {activeTab === 'bars' && (
          <div className="p-10 text-center text-gray-500">Bars list feature coming soon...</div>
        )}
        
        <div className="h-8"></div>
      </main>

      {/* Floating Action Button */}
      <div className="absolute bottom-24 left-0 right-0 flex justify-center z-30 pointer-events-none">
        <button className="pointer-events-auto flex items-center gap-3 bg-[#1e1e1e] text-white pl-5 pr-6 py-3.5 rounded-full border border-primary/40 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] shadow-primary/10 active:scale-95 transition-transform hover:bg-[#252525]">
          <span className="material-symbols-outlined text-primary">tune</span>
          <span className="font-bold text-sm tracking-wide">Filters</span>
          <span className="flex items-center justify-center bg-primary text-[#121212] text-[10px] font-bold h-5 w-5 rounded-full ml-1">2</span>
        </button>
      </div>

      {/* Bottom Tab Bar - Always visible */}
      <BottomTabBar />
    </div>
  );
}
