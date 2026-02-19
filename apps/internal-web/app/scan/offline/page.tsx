/**
 * Offline State Page
 * 完全按照 uimerchant/staff_scan__offline_state/code.html 设计
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function OfflinePage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount] = useState(3); // TODO: 从本地存储获取

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    // 如果已经在线，返回扫描页面
    router.push('/scan');
    return null;
  }

  return (
    <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto bg-background-light dark:bg-background-dark text-[#0c1d1d] dark:text-white font-display overflow-hidden min-h-screen">
      {/* Offline Banner */}
      <div className="bg-status-amber w-full py-2.5 px-4 flex items-center justify-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-black text-[18px]">cloud_off</span>
          <p className="text-black text-xs font-bold uppercase tracking-wider">Offline – scans will sync when online</p>
        </div>
      </div>

      {/* Top App Bar */}
      <div className="flex items-center bg-background-light dark:bg-background-dark p-4 justify-between border-b border-gray-200 dark:border-zinc-800">
        <button
          onClick={() => router.back()}
          className="text-primary flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center">Scan Tickets</h2>
        <div className="flex w-10 items-center justify-end">
          <button className="text-primary">
            <span className="material-symbols-outlined">help_outline</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex flex-col items-center justify-start h-[calc(100vh-120px)] p-6 pt-10">
        {/* Headline */}
        <div className="mb-8 text-center">
          <h3 className="text-2xl font-bold leading-tight mb-2">Ready to Scan</h3>
          <p className="text-gray-500 dark:text-zinc-400 text-sm">Align the QR code within the frame below</p>
        </div>

        {/* Camera Viewfinder Placeholder */}
        <div className="relative w-full aspect-square max-w-[320px] rounded-3xl overflow-hidden shadow-2xl bg-black group">
          {/* Simulated Camera Feed */}
          <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center">
            <div className="absolute inset-0 opacity-40 bg-gradient-to-b from-purple-900/50 to-black"></div>
            {/* Scanning Frame Corners */}
            <div className="absolute top-8 left-8 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-xl"></div>
            <div className="absolute top-8 right-8 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-xl"></div>
            <div className="absolute bottom-8 left-8 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-xl"></div>
            <div className="absolute bottom-8 right-8 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-xl"></div>
            {/* Laser Line Simulation */}
            <div className="w-[70%] h-0.5 bg-primary/50 shadow-[0_0_15px_#006666] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
          </div>

          {/* Sync Indicator Overlay */}
          {pendingCount > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm animate-pulse">sync</span>
              <p className="text-white text-[11px] font-bold tracking-wide uppercase">Syncing... {pendingCount} pending</p>
            </div>
          )}
        </div>

        {/* Camera Controls */}
        <div className="mt-8 flex items-center justify-center gap-8">
          <button className="flex shrink-0 items-center justify-center rounded-full size-12 bg-white/10 dark:bg-white/5 border border-black/5 dark:border-white/10 text-primary hover:bg-primary/10 transition-colors">
            <span className="material-symbols-outlined">history</span>
          </button>
          <button className="flex shrink-0 items-center justify-center rounded-full size-20 bg-primary shadow-xl shadow-primary/30 text-white transition-all active:scale-90">
            <span className="material-symbols-outlined text-4xl leading-none">qr_code_scanner</span>
          </button>
          <button className="flex shrink-0 items-center justify-center rounded-full size-12 bg-white/10 dark:bg-white/5 border border-black/5 dark:border-white/10 text-primary hover:bg-primary/10 transition-colors">
            <span className="material-symbols-outlined">flashlight_on</span>
          </button>
        </div>
      </div>
    </div>
  );
}
