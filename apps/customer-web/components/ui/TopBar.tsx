'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { useRouter } from 'next/navigation';
import { getRegions, type Region } from '@/lib/data/regions';

export default function TopBar() {
  const router = useRouter();
  const { user } = useAuth();
  const { region, setRegion, selectCurrentLocation } = useRegion();
  
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [geoToast, setGeoToast] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const isSingleRegion = regions.length === 1;

  useEffect(() => {
    if (geoToast) {
      const t = setTimeout(() => setGeoToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [geoToast]);

  const handleCurrentLocation = async () => {
    setGeoToast(null);
    setGeoLoading(true);
    try {
      const result = await selectCurrentLocation();
      if (result.success) {
        setIsRegionOpen(false);
      } else {
        setGeoToast("We don't support your area yet. Please choose a city.");
      }
    } finally {
      setGeoLoading(false);
    }
  };

  useEffect(() => {
    // Lazy load regions or eager load
    getRegions().then(setRegions).catch(() => setRegions([]));

    const handleOpenEvent = () => setIsRegionOpen(true);
    window.addEventListener('lux-open-region-picker', handleOpenEvent);
    return () => window.removeEventListener('lux-open-region-picker', handleOpenEvent);
  }, []);

  const handleRegionSelect = (r: Region) => {
    setRegion(r.id);
    setIsRegionOpen(false);
  };

  return (
    <>
      {/* Region Picker Modal - Phone Optimized */}
      {isRegionOpen && (
        <div className="fixed inset-0 z-[60] flex justify-center bg-black/80 backdrop-blur-sm">
           {/* Mobile Container */}
           <div className="w-full max-w-md h-full bg-black shadow-2xl overflow-hidden relative flex flex-col">
             {/* Subtle ambient */}
             <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-[#C5A028]/5 rounded-full blur-[60px] pointer-events-none z-0" />
             
             {/* Main Content */}
             <main className="relative z-10 flex-1 flex flex-col overflow-y-auto no-scrollbar pb-safe-bottom">
               <header className="pt-safe-top px-6 pb-2 flex flex-col gap-2 mt-4">
                 <div className="flex items-center justify-between">
                   <h2 className="text-[32px] font-bold tracking-tight text-white leading-[1.1]">
                     Choose<br />your area
                   </h2>
                   <button
                     onClick={() => setIsRegionOpen(false)}
                     className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                     aria-label="Close"
                   >
                     <span className="material-symbols-outlined text-white">close</span>
                   </button>
                 </div>
               </header>
               
               <section className="px-6 flex-1 mt-6">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-sm font-bold uppercase tracking-widest text-[#8A7E5E]">Regions</h3>
                 </div>
                 {geoToast && (
                   <div className="mb-4 py-3 px-4 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm">
                     {geoToast}
                   </div>
                 )}
                 {/* Current Location row */}
                 <button
                   type="button"
                   onClick={handleCurrentLocation}
                   disabled={geoLoading}
                   className="w-full group flex items-center justify-between py-4 px-3 rounded-lg transition-all hover:bg-white/5 border border-transparent mb-2"
                 >
                   <div className="flex flex-col items-start">
                     <span className="text-xl font-medium text-white">Current Location</span>
                     <span className="text-xs text-zinc-500 mt-0.5">Use my location</span>
                   </div>
                   <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8A7E5E] bg-[#8A7E5E]/15 px-2 py-1 rounded">
                     <span className="material-symbols-outlined text-sm">location_on</span>
                     {geoLoading ? '…' : 'AUTO'}
                   </span>
                 </button>
                 {regions.length === 0 ? (
                   <div className="text-center py-8 text-white/50">Loading regions...</div>
                 ) : (
                   <div className="flex flex-col space-y-2">
                     {regions.map((r) => (
                       <button
                         key={r.id}
                         onClick={() => handleRegionSelect(r)}
                         className={`w-full group flex items-center justify-between py-4 px-3 rounded-lg transition-all ${r.id === region?.id ? 'bg-[#C5A028]/10 border border-[#C5A028]/20' : 'hover:bg-white/5 border border-transparent'}`}
                       >
                         <span className={`text-xl font-medium ${r.id === region?.id ? 'text-[#C5A028]' : 'text-white'}`}>{r.name}</span>
                         <span className={`material-symbols-outlined ${r.id === region?.id ? 'text-[#C5A028]' : 'text-white/40'}`}>chevron_right</span>
                       </button>
                     ))}
                   </div>
                 )}
               </section>
             </main>
           </div>
        </div>
      )}

      {/* Header: Slim when single region, full when multi-city */}
      <header className="sticky top-0 z-50 flex flex-col w-full bg-[#050505]/90 backdrop-blur-xl pt-safe-top border-b border-white/5">
        <div className={`flex items-center justify-between px-5 ${isSingleRegion ? 'py-3' : 'pt-4 pb-3'}`}>
          {isSingleRegion ? (
            <span className="text-sm text-zinc-400">{region?.name ?? ''}</span>
          ) : (
            <button 
              onClick={() => setIsRegionOpen(true)}
              className="group flex items-center gap-2 bg-transparent text-left"
            >
              <span className="text-xl font-medium text-white">{region ? region.name : 'Select Area'}</span>
              <span className="material-symbols-outlined text-[#C5A028] text-lg">expand_more</span>
            </button>
          )}
          <div className="flex items-center gap-3">
            <button className="flex items-center justify-center text-white transition-colors hover:text-[#D4AF37]">
              <span className="material-symbols-outlined text-[24px] font-light">search</span>
            </button>
            <button 
              onClick={() => router.push('/profile')}
              className="relative h-8 w-8 rounded-full border border-white/10 active:scale-[0.96] transition-transform duration-150 ease-out"
            >
               <div className="absolute inset-0 overflow-hidden rounded-full">
                  {user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="Profile" className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="h-full w-full bg-zinc-800 flex items-center justify-center">
                       <span className="material-symbols-outlined text-[16px] text-white/50">person</span>
                    </div>
                  )}
               </div>
               <div className="absolute -bottom-1 -right-1 z-10 flex items-center justify-center rounded-full bg-black">
                  <span className="material-symbols-outlined text-[14px] text-[#8A7E5E]/80">settings</span>
               </div>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
