'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '../../components/ui/Button';
import { getStripe } from '@/lib/stripe/client';

// Simulate payment stages
type PaymentStatus = 'idle' | 'processing' | 'success' | 'failed';

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId') || '';
  const totalPrice = searchParams.get('total') || '0';
  
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Invite Code State
  const [inviteCode, setInviteCode] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [inviteMessage, setInviteMessage] = useState('');
  const [appliedAmbassador, setAppliedAmbassador] = useState('');
  const [finalInviteCode, setFinalInviteCode] = useState('');

  const validateInvite = async () => {
    if (!inviteCode.trim()) return;
    setInviteStatus('validating');
    setInviteMessage('');
    
    try {
        const res = await fetch(`/api/public/invites/validate?code=${encodeURIComponent(inviteCode)}&eventId=${eventId}`);
        const data = await res.json();
        
        if (data.ok && data.valid) {
            setInviteStatus('valid');
            setAppliedAmbassador(data.ambassadorName);
            setFinalInviteCode(data.code);
            setInviteMessage(`Applied: ${data.ambassadorName}`);
        } else {
            setInviteStatus('invalid');
            setInviteMessage(data.message || 'Invalid code');
            setFinalInviteCode('');
        }
    } catch (e) {
        setInviteStatus('invalid');
        setInviteMessage('Validation failed');
    }
  };

  const clearInvite = () => {
      setInviteCode('');
      setInviteStatus('idle');
      setInviteMessage('');
      setAppliedAmbassador('');
      setFinalInviteCode('');
  };
  
  const handlePayment = async () => {
    setStatus('processing');
    setError(null);

    try {
      // Get items from localStorage
      const itemsJson = localStorage.getItem('checkout_items');
      const eventWeekId = localStorage.getItem('checkout_eventWeekId'); // Ensure this exists or fallback?
      // Assuming items stored are already compatible or we need to map them.
      // Items should be: { ticketTypeId, eventWeekDayId, quantity }
      
      if (!itemsJson || !eventId) {
        setStatus('failed');
        setError('Missing checkout information');
        return;
      }

      const items = JSON.parse(itemsJson);

      // Call API to create Stripe checkout session (V2)
      const response = await fetch('/api/public/checkout-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            eventId, 
            eventWeekId: eventWeekId, // We might need to ensure this is saved in previous flow
            items, 
            inviteCode: finalInviteCode || undefined
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // 检查是否是 Stripe 未配置错误
        if (data.error?.code === 'STRIPE_NOT_CONFIGURED') {
          throw new Error('Stripe payment is not configured. Please contact support.');
        }
        throw new Error(data.error?.message || 'Failed to create checkout session');
      }

      const sessionId = data.data?.sessionId;

      if (!sessionId) {
        throw new Error('Invalid response from server');
      }

      // Redirect to Stripe Checkout
      const stripe = await getStripe();
      if (!stripe) {
        throw new Error('Stripe payment is not configured. Please contact support.');
      }

      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      // Clear localStorage
      localStorage.removeItem('checkout_items');
      localStorage.removeItem('checkout_eventId');
      localStorage.removeItem('checkout_total');
      localStorage.removeItem('checkout_eventWeekId');
    } catch (err: any) {
      console.error('Payment error:', err);
      setStatus('failed');
      setError(err.message || 'Payment failed');
    }
  };

  // Check for successful payment return from Stripe
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      setStatus('success');
    }
  }, [searchParams]);

  const goToWallet = () => {
    router.push('/wallet');
  };

  // 1. Processing State View
  if (status === 'processing') {
    return (
        <div className="bg-background-dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden text-white max-w-md mx-auto">
            <div className="flex flex-col items-center justify-center w-full">
                <div className="relative mb-12">
                    <div className="absolute inset-0 bg-primary/20 blur-[30px] rounded-full scale-150"></div>
                    <svg className="w-24 h-24 text-primary relative z-10 animate-spin" viewBox="0 0 50 50">
                        <circle className="opacity-10" cx="25" cy="25" fill="none" r="20" stroke="currentColor" strokeWidth="1.5"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
                <h1 className="font-display text-white text-2xl font-medium tracking-wide leading-tight text-center mb-3">
                    Confirming payment...
                </h1>
                <p className="font-sans text-secondary text-sm font-light tracking-wider text-center opacity-90">
                    Usually takes 10-20 seconds
                </p>
            </div>
        </div>
    );
  }

  // 2. Success State View
  if (status === 'success') {
     return (
        <div className="bg-background-dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden text-white max-w-md mx-auto">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]"></div>
            </div>
            <div className="relative z-10 w-full flex flex-col items-center py-4">
                <div className="flex flex-col items-center justify-center mt-12 mb-8">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-transparent border border-primary/40 flex items-center justify-center shadow-[0_0_30px_rgba(200,171,95,0.2)]">
                        <span className="material-symbols-outlined text-5xl text-primary font-bold">check</span>
                    </div>
                    <h1 className="mt-8 font-display text-3xl text-white font-medium tracking-wide text-center">Payment Successful</h1>
                </div>
                
                {/* Receipt Card */}
                <div className="w-full bg-[#1A1A1A] backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-8 relative">
                    <div className="space-y-6">
                         <div className="flex justify-between items-start border-b border-white/5 pb-5">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1 font-bold">Event</span>
                                <h2 className="font-display text-white text-xl leading-tight">Your Tickets are Ready</h2>
                            </div>
                         </div>
                         <div className="flex justify-between items-center pt-2">
                            <span className="text-sm text-zinc-300 font-medium">Total Paid</span>
                            <span className="text-xl text-primary font-display font-bold">${totalPrice}</span>
                        </div>
                    </div>
                </div>

                <div className="w-full space-y-3 mt-auto">
                    <Button onClick={goToWallet} fullWidth icon="wallet">Go to Wallet</Button>
                </div>
            </div>
        </div>
     );
  }

  // 3. Failed State View
  if (status === 'failed') {
      return (
        <div className="bg-background-dark min-h-screen flex items-center justify-center p-6 relative overflow-hidden text-white max-w-md mx-auto">
             <div className="flex flex-col items-center mb-8 relative group">
                <div className="relative w-24 h-24 rounded-full border border-white/5 bg-gradient-to-b from-white/5 to-transparent flex items-center justify-center shadow-2xl backdrop-blur-sm">
                    <span className="material-symbols-outlined text-[48px] text-alert-red drop-shadow-lg">warning</span>
                </div>
            </div>
            <div className="flex flex-col items-center mb-12 w-full text-center space-y-3">
                <h1 className="font-display text-white text-4xl font-medium tracking-wide leading-tight">Payment Failed</h1>
                <p className="font-sans text-white/60 text-lg font-light max-w-[80%] leading-relaxed">{error || 'Payment could not be processed.'}</p>
            </div>
            <div className="w-full space-y-4 mb-8">
                <Button onClick={() => setStatus('idle')} fullWidth icon="refresh">Try Again</Button>
                <Button variant="outline" fullWidth onClick={() => router.back()}>Cancel</Button>
            </div>
        </div>
      );
  }

  // 4. Default Idle View (Review Order)
  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col max-w-md mx-auto text-gray-900 dark:text-white">
        <header className="flex items-center px-6 py-5 justify-between sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
            <button onClick={() => router.back()} className="flex size-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
            <h2 className="text-lg font-bold tracking-tight">Checkout</h2>
            <div className="size-10"></div>
        </header>

        <main className="flex-1 px-6 pt-6 pb-32 flex flex-col gap-6">
            {/* Order Summary Card */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-xl p-6 shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden group">
                {/* Decorative top border */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">Order Summary</h4>
                
                {/* Simplified Item Display (since we don't have detailed item info in searchParams) */}
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <p className="text-gray-900 dark:text-white font-medium text-base">Current Order</p>
                    </div>
                    <p className="text-gray-900 dark:text-white font-medium">${totalPrice}</p>
                </div>
                
                {/* Divider */}
                <div className="h-px w-full bg-gray-200 dark:bg-white/10 my-4"></div>
                
                {/* Breakdown */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Total</span>
                        <span className="text-gray-900 dark:text-white">${totalPrice}</span>
                    </div>
                </div>

                {/* Invite Code Input */}
                <div className="mt-6 pt-4 border-t border-dashed border-gray-300 dark:border-white/20">
                     <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Ambassador Code</p>
                     
                     {inviteStatus === 'valid' ? (
                          <div className="flex items-center justify-between bg-status-success-bg dark:bg-status-success-bg-dark border border-status-success-border dark:border-status-success-border-dark p-3 rounded-md">
                                <div className="flex flex-col">
                                    <span className="text-xs text-status-success-text dark:text-status-success-text-dark font-bold">Code Applied</span>
                                    <span className="text-sm font-medium text-gray-800 dark:text-white">{inviteMessage}</span>
                                </div>
                                <button onClick={clearInvite} className="text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400">
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                          </div>
                     ) : (
                         <div className="flex gap-2">
                             <input 
                                type="text"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value)}
                                placeholder="Enter invite code"
                                className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-md px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                             />
                             <button 
                                onClick={validateInvite}
                                disabled={!inviteCode.trim() || inviteStatus === 'validating'}
                                className="bg-gray-900 dark:bg-white text-white dark:text-black px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
                             >
                                {inviteStatus === 'validating' ? '...' : 'Apply'}
                             </button>
                         </div>
                     )}
                     
                     {inviteStatus === 'invalid' && (
                         <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                             <span className="material-symbols-outlined text-[14px]">error</span>
                             {inviteMessage}
                         </p>
                     )}
                </div>
            </div>

            {/* Agreement */}
            <div className="px-2">
                <label className="flex gap-x-3 items-start cursor-pointer group/check">
                    <div className="relative flex items-center mt-0.5">
                        <input className="peer h-5 w-5 appearance-none rounded border-2 border-gray-400 dark:border-gray-600 bg-transparent checked:bg-primary checked:border-primary focus:ring-0 focus:ring-offset-0 transition-all duration-200" type="checkbox"/>
                        <span className="material-symbols-outlined absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontSize: '16px' }}>check</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-normal leading-snug">
                        I agree to the <a className="text-primary hover:underline font-medium" href="#">Terms of Service</a> and acknowledge the non-refundable <a className="text-primary hover:underline font-medium" href="#">Refund Policy</a>.
                    </p>
                </label>
            </div>
        </main>

        {/* Sticky Footer Action */}
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-6 bg-gradient-to-t from-background-light via-background-light to-transparent dark:from-background-dark dark:via-background-dark dark:to-transparent z-20 pb-8">
            <button 
                onClick={handlePayment}
                className="w-full bg-primary hover:bg-primary-hover active:scale-[0.98] transition-all duration-200 text-white font-bold text-lg h-14 rounded-xl shadow-[0_8px_20px_-6px_rgba(200,152,30,0.5)] flex items-center justify-between px-6 group"
            >
                <span>Proceed to Pay</span>
                <div className="flex items-center gap-2">
                    <span className="opacity-90 font-medium">${totalPrice}</span>
                    <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform" style={{ fontSize: '20px' }}>arrow_forward</span>
                </div>
            </button>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-gray-400 dark:text-gray-600">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>lock</span>
                <span className="text-[10px] font-medium uppercase tracking-widest">Secure Checkout 256-bit SSL</span>
            </div>
        </div>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <CheckoutPageContent />
    </Suspense>
  );
}
