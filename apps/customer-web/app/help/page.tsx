'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@luxnight.app';

const FAQ: { q: string; a: string }[] = [
  { q: 'How do I find my ticket?', a: 'Go to Wallet from the bottom navigation. Your tickets are listed by event. Tap a ticket to see details and the QR code for entry.' },
  { q: 'How do I use the QR code at entry?', a: 'Open the ticket in Wallet, tap "Show Ticket", and present the QR code to staff. They will scan or verify it to complete entry.' },
  { q: "What if my ticket doesn't show up after payment?", a: 'Usually it appears within a few minutes. If not, pull to refresh on the Wallet screen. Still missing? Contact support with your order details.' },
  { q: 'Can I transfer my ticket to a friend?', a: 'Transfer is not yet supported. The ticket is tied to your account. For some events, the organizer may allow changes — contact support to ask.' },
  { q: 'Refund policy & chargebacks', a: 'Refunds depend on the event. Check the event page for the specific policy. For chargebacks or disputes, contact support with your order ID.' },
  { q: 'What does "Active / Used / Refunded" mean?', a: 'Active: valid for entry. Used: already scanned at the door. Refunded: the order was refunded and the ticket is no longer valid.' },
  { q: 'Contact support', a: `Email us at ${SUPPORT_EMAIL}. We typically respond within 24 hours.` },
];

export default function HelpPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=' + encodeURIComponent('/help'));
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-background-dark text-white pb-8">
      <header className="sticky top-0 z-10 px-6 py-4 bg-background-dark/95 backdrop-blur-md border-b border-white/5 flex items-center gap-4">
        <Link href="/profile" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Help & Support</h1>
      </header>

      <main className="flex-1 px-6 py-6">
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">FAQ</h2>
          <div className="space-y-2">
            {FAQ.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl bg-[#1A1D1F] border border-white/10 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-white font-medium text-sm pr-4">{faq.q}</span>
                  <span className={`material-symbols-outlined text-white/40 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`}>expand_more</span>
                </button>
                {open === i && (
                  <div className="px-4 pb-4 pt-0 border-t border-white/5">
                    <p className="text-white/60 text-sm pt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-primary/20 text-primary font-semibold border border-primary/40 hover:bg-primary/30 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>mail</span>
          Contact Support
        </a>
      </main>
    </div>
  );
}
