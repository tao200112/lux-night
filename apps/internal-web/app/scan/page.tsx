/**
 * Ticket Scanner Page
 * 完全按照 uimerchant/staff__ticket_scanner/code.html 设计
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ScanPage() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    loadUserRole();
  }, []);

  const loadUserRole = async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        // 获取第一个 membership 的 role
        const role = data.memberships?.[0]?.role || data.roles?.merchant_memberships?.[0]?.role || null;
        setUserRole(role?.toLowerCase() || null);
      }
    } catch (err) {
      console.error('Failed to load user role:', err);
    }
  };

  return (
    <div className="relative flex h-screen w-full max-w-[430px] lg:max-w-6xl mx-auto flex-col overflow-hidden bg-background-dark text-white">
      {/* Camera Background Simulation */}
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-slate-900 overflow-hidden">
          <div className="w-full h-full opacity-60 bg-gradient-to-b from-purple-900/50 to-black bg-cover bg-center"></div>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
        </div>
      </div>

      {/* Top Bar (Operational Header) */}
      <div className="relative z-10 flex items-center justify-between p-4 pt-8">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 border border-white/10">
          <div className="text-primary material-symbols-outlined text-xl">nightlife</div>
          <h2 className="text-white text-sm font-bold tracking-tight">The Onyx Club</h2>
          <span className="material-symbols-outlined text-white/50 text-sm">expand_more</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-primary px-3 py-1 rounded-full shadow-lg shadow-primary/20">
            <span className="text-[10px] font-black tracking-[0.1em] uppercase">Staff</span>
          </div>
          {/* 只有 owner/manager/admin 可以访问设置 */}
          {userRole && userRole !== 'staff' && (
            <Link 
              href="/settings"
              className="size-10 flex items-center justify-center rounded-full bg-black/60 border border-white/10 text-white"
            >
              <span className="material-symbols-outlined">settings</span>
            </Link>
          )}
        </div>
      </div>

      {/* Main Scanning Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        {/* Section Header Style for Instruction */}
        <div className="mb-8">
          <h4 className="text-primary text-xs font-bold leading-normal tracking-[0.2em] px-4 py-1 text-center bg-primary/10 rounded-full border border-primary/20 uppercase">Ready to scan</h4>
        </div>

        {/* Viewfinder */}
        <div className="relative w-[260px] h-[260px] border-2 border-white/10 rounded-3xl bg-black/20">
          <div className="absolute top-[-2px] left-[-2px] w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-3xl"></div>
          <div className="absolute top-[-2px] right-[-2px] w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-3xl"></div>
          <div className="absolute bottom-[-2px] left-[-2px] w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-3xl"></div>
          <div className="absolute bottom-[-2px] right-[-2px] w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-3xl"></div>
          {/* Scan Line */}
          <div className="absolute top-[5%] left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_15px] shadow-primary animate-scan"></div>
        </div>

        {/* Body Text Overlay */}
        <div className="mt-8 text-center px-8">
          <p className="text-white/90 text-lg font-medium tracking-tight">Scan ticket QR</p>
          <p className="text-white/50 text-xs mt-1">Center the code within the frame to validate</p>
        </div>
      </div>

      {/* Camera Controls & Bottom Navigation */}
      <div className="relative z-10 px-6 pb-12">
        {/* CameraControl-inspired Utility Buttons */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <button className="flex shrink-0 items-center justify-center rounded-full size-12 bg-black/60 border border-white/10 text-white transition-all active:scale-95">
            <span className="material-symbols-outlined">history</span>
          </button>
          <button 
            onClick={() => setScanning(!scanning)}
            className="flex shrink-0 items-center justify-center rounded-full size-20 bg-primary shadow-xl shadow-primary/30 text-white transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-4xl leading-none">qr_code_scanner</span>
          </button>
          <button className="flex shrink-0 items-center justify-center rounded-full size-12 bg-black/60 border border-white/10 text-white transition-all active:scale-95 group">
            <span className="material-symbols-outlined group-active:text-primary">flashlight_on</span>
          </button>
        </div>

        {/* ButtonGroup-inspired Actions */}
        <div className="flex justify-stretch gap-3">
          <Link 
            href="/scan/lookup"
            className="flex-1 flex cursor-pointer items-center justify-center overflow-hidden rounded-xl h-14 px-5 bg-white/10 backdrop-blur-md text-white border border-white/10 text-sm font-bold leading-normal tracking-wide transition-all active:bg-white/20"
          >
            <span className="material-symbols-outlined mr-2 text-xl">search</span>
            <span className="truncate uppercase">Manual Lookup</span>
          </Link>
          <button className="w-14 flex cursor-pointer items-center justify-center overflow-hidden rounded-xl h-14 bg-white/10 backdrop-blur-md text-white border border-white/10 transition-all active:bg-white/20">
            <span className="material-symbols-outlined">more_horiz</span>
          </button>
        </div>
      </div>

      {/* Safe Area Home Indicator Background */}
      <div className="h-5 bg-transparent"></div>

      {/* High-Contrast Status Gradient (Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent pointer-events-none z-0"></div>

    </div>
  );
}
