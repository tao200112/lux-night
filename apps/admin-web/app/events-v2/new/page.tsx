/**
 * Admin Create Event V2 Page - Step 1
 * 创建活动基本信息（Title, Poster, Status, Context）
 */

'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Helper to format address
const formatAddress = (venue: any) => {
  if (!venue) return 'No Venue Assigned';
  return venue.address || venue.name || 'Unknown Location';
};

function NewEventForm() {
  console.log('[HIT] V2 events-v2/new');
  const router = useRouter();
  const searchParams = useSearchParams();
  const merchantId = searchParams.get('merchant_id');

  const [loading, setLoading] = useState(false);
  const [fetchingMerchant, setFetchingMerchant] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data State
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'paused' | 'archived'>('draft');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  
  // Context Data
  const [merchantData, setMerchantData] = useState<{
    name: string;
    timezone: string;
  } | null>(null);

  // Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!merchantId) {
      setFetchingMerchant(false);
      return;
    }

    const fetchMerchant = async () => {
      try {
        const res = await fetch(`/api/admin/merchants/${merchantId}`);
        const json = await res.json();
        
        if (!json.success || !json.data) {
          throw new Error('Failed to load merchant data');
        }

        const m = json.data;
        const venue = m.venues?.[0]; 

        setMerchantData({
          name: m.name,
          timezone: 'America/New_York',
        });
        
        // Pre-fill venue info from merchant defaut
        if (venue) {
           setVenueName(venue.name || '');
           setVenueAddress(formatAddress(venue));
        }

      } catch (err) {
        console.error('Error fetching merchant:', err);
      } finally {
        setFetchingMerchant(false);
      }
    };

    fetchMerchant();
  }, [merchantId]);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      if (merchantId) {
        formData.append('merchant_id', merchantId);
      }

      const res = await fetch('/api/admin/uploads/poster', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Upload failed');
      }

      setPosterUrl(result.data.poster_url);
    } catch (err: any) {
      console.error('Upload Error:', err);
      alert('Failed to upload poster: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!merchantId) throw new Error('Merchant ID is missing');
      if (!title) throw new Error('Title is required');
      if (!posterUrl) throw new Error('Event Poster is required');

      const response = await fetch('/api/admin/events-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          title,
          subtitle,
          description,
          poster_url: posterUrl,
          venue_name: venueName,
          address: venueAddress,
          status,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Success
      alert('✅ Event Created! Redirecting to configuration...');
      router.push(`/events-v2/${result.event.id}/week`);

    } catch (err: any) {
      console.error('[Create Event] Error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  if (!merchantId) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-red-400">Merchant ID is missing.</p>
          <Link href="/merchants" className="text-primary hover:underline">
            Go to Merchants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans flex flex-col relative overflow-x-hidden selection:bg-[#1313ec]/30 selection:text-white">
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-[#262626]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto w-full">
          <Link 
            href={`/merchants/${merchantId}`}
            className="flex items-center justify-center text-[#9d9db9] active:text-white transition-colors"
          >
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
              <span className="text-sm font-medium hidden sm:block">Events</span>
            </div>
          </Link>
          <h2 className="text-white text-base font-bold tracking-tight">Create Event</h2>
          <div className="w-[60px]"></div>
        </div>
        <div className="h-[2px] w-full bg-[#262626]">
          <div className="h-full w-1/2 bg-[#1313ec]"></div>
        </div>
      </div>

      <main className="flex-1 flex flex-col px-4 pt-6 pb-32 space-y-8 max-w-lg mx-auto w-full">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white/90">Event Poster <span className="text-red-500">*</span></h3>
          <div 
            className={`relative group cursor-pointer w-full aspect-[4/3] rounded-xl border border-dashed transition-all flex flex-col items-center justify-center gap-3 overflow-hidden
              ${isDragging ? 'border-[#1313ec] bg-[#111111]' : 'border-[#333333] bg-[#111111] hover:bg-[#161616] hover:border-[#444444]'}
              ${posterUrl ? 'border-solid border-[#444444]' : ''}
            `}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {posterUrl ? (
              <>
                <img src={posterUrl} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs font-bold px-3 py-1 bg-black/60 rounded-full border border-white/20">Change Poster</span>
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1313ec]/20 via-transparent to-transparent"></div>
                <div className="z-10 bg-[#1c1c1c] rounded-full p-3 border border-[#333333] group-hover:scale-110 transition-transform duration-300">
                  {uploading ? (
                    <div className="animate-spin h-6 w-6 border-2 border-[#9d9db9] border-t-white rounded-full"></div>
                  ) : (
                    <span className="material-symbols-outlined text-[#9d9db9]" style={{ fontSize: '28px' }}>add_photo_alternate</span>
                  )}
                </div>
                {!uploading && (
                  <div className="z-10 text-center px-4">
                    <p className="text-white text-sm font-medium">Upload Poster</p>
                    <p className="text-[#666666] text-xs mt-1">Tap to select or drag file</p>
                  </div>
                )}
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
            />
          </div>
        </section>

        <section className="space-y-5">
          <h3 className="text-sm font-semibold text-white/90 flex items-center justify-between">
            Basic Details
            <span className="text-[10px] bg-[#1313ec]/20 text-[#1313ec] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Step 1</span>
          </h3>
          
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#9d9db9] uppercase tracking-wide ml-1">Event Title <span className="text-red-500">*</span></label>
            <input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#111111] border border-[#262626] rounded-lg px-4 py-3.5 text-white placeholder-[#444444] focus:outline-none focus:border-[#1313ec] focus:ring-1 focus:ring-[#1313ec] transition-all text-base" 
              placeholder="e.g. Summer Bass Night" 
              type="text"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#9d9db9] uppercase tracking-wide ml-1">Subtitle</label>
            <input 
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full bg-[#111111] border border-[#262626] rounded-lg px-4 py-3.5 text-white placeholder-[#444444] focus:outline-none focus:border-[#1313ec] focus:ring-1 focus:ring-[#1313ec] transition-all text-base" 
              placeholder="e.g. Special Guest DJ" 
              type="text"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#9d9db9] uppercase tracking-wide ml-1">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#111111] border border-[#262626] rounded-lg px-4 py-3 text-white placeholder-[#444444] focus:outline-none focus:border-[#1313ec] focus:ring-1 focus:ring-[#1313ec] transition-all text-base resize-none" 
              placeholder="Describe the vibe, lineup, and dress code..." 
              rows={4}
            ></textarea>
          </div>


        </section>

        <section className="space-y-5">
            <h3 className="text-sm font-semibold text-white/90">Venue Details</h3>
            <div className="grid grid-cols-1 gap-4">
                 <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#9d9db9] uppercase tracking-wide ml-1">Venue Name</label>
                    <input 
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      className="w-full bg-[#111111] border border-[#262626] rounded-lg px-4 py-3.5 text-white placeholder-[#444444] focus:outline-none focus:border-[#1313ec] focus:ring-1 focus:ring-[#1313ec] transition-all text-base" 
                      placeholder="e.g. Club Space" 
                      type="text"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#9d9db9] uppercase tracking-wide ml-1">Address</label>
                    <input 
                      value={venueAddress}
                      onChange={(e) => setVenueAddress(e.target.value)}
                      className="w-full bg-[#111111] border border-[#262626] rounded-lg px-4 py-3.5 text-white placeholder-[#444444] focus:outline-none focus:border-[#1313ec] focus:ring-1 focus:ring-[#1313ec] transition-all text-base" 
                      placeholder="e.g. 34 NE 11th St" 
                      type="text"
                    />
                 </div>
            </div>
        </section>

        <section className="pt-2">
          <div className="bg-[#111111] border border-[#262626] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[#666666] text-[18px]">info</span>
              <span className="text-xs font-bold text-[#666666] uppercase tracking-wider">Context Data</span>
            </div>
            
            {fetchingMerchant ? (
               <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-[#222] rounded w-1/3"></div>
                <div className="h-4 bg-[#222] rounded w-2/3"></div>
               </div>
            ) : merchantData ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#666666] uppercase tracking-wider font-mono mb-0.5">Merchant</span>
                  <span className="text-sm text-[#cccccc] font-mono truncate">{merchantData.name}</span>
                </div>
                <div className="h-[1px] bg-[#222222] w-full"></div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#666666] uppercase tracking-wider font-mono mb-0.5">Timezone</span>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#666666] text-[14px]">schedule</span>
                    <span className="text-sm text-[#1313ec] font-mono">{merchantData.timezone}</span>
                  </div>
                </div>
              </div>
            ) : (
               <div className="text-red-500 text-sm">Failed to load context.</div>
            )}
          </div>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 w-full z-40 bg-[#0A0A0A]/90 backdrop-blur-lg border-t border-[#262626] p-4 pb-6 safe-area-bottom">
        <div className="max-w-lg mx-auto w-full flex gap-3">
          <button 
            onClick={handleSubmit}
            disabled={loading || !title || !posterUrl}
            className="flex-1 bg-[#1313ec] hover:bg-[#1313ec]/90 active:scale-[0.98] text-white font-bold text-base py-3.5 px-6 rounded-lg shadow-[0_0_15px_rgba(19,19,236,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? (
              <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></span>
            ) : (
              <>
                Save Draft & Configure
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default function NewEventV2Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">Loading...</div>}>
      <NewEventForm />
    </Suspense>
  );
}
