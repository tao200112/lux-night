'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '../../components/ui/Button';
import { getStripe } from '@/lib/stripe/client';

// Simulate payment stages
type PaymentStatus = 'idle' | 'processing' | 'success' | 'failed';

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId') || '';
  const totalPrice = searchParams.get('total') || '0';
  
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const handlePayment = async () => {
    setStatus('processing');
    setError(null);

    try {
      // Get items from localStorage
      const itemsJson = localStorage.getItem('checkout_items');
      if (!itemsJson || !eventId) {
        setStatus('failed');
        setError('Missing checkout information');
        return;
      }

      const items = JSON.parse(itemsJson);

      // Call API to create Stripe checkout session
      const response = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, items }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      const stripe = await getStripe();
      if (!stripe) {
        throw new Error('Stripe failed to load');
      }

      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      // Clear localStorage
      localStorage.removeItem('checkout_items');
      localStorage.removeItem('checkout_eventId');
      localStorage.removeItem('checkout_total');
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
                                <h2 className="font-display text-white text-xl leading-tight">Neon Nights:<br/>Deep House</h2>
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
                {/* Item */}
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <p className="text-gray-900 dark:text-white font-medium text-base">General Admission</p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Quantity: 2</p>
                    </div>
                    <p className="text-gray-900 dark:text-white font-medium">${totalPrice}</p>
                </div>
                {/* Divider */}
                <div className="h-px w-full bg-gray-200 dark:bg-white/10 my-4"></div>
                {/* Breakdown */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                        <span className="text-gray-900 dark:text-white">${totalPrice}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Service Fee</span>
                        <span className="text-gray-900 dark:text-white">$10.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Taxes</span>
                        <span className="text-gray-900 dark:text-white">$5.00</span>
                    </div>
                </div>
                {/* Total Display */}
                <div className="mt-6 pt-4 border-t border-dashed border-gray-300 dark:border-white/20 flex items-end justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 pb-1">Total Amount</span>
                    <span className="text-3xl font-bold text-primary tracking-tight">${Number(totalPrice) + 15}</span>
                </div>
            </div>

            {/* Payment Method Preview */}
            <div className="bg-surface-light dark:bg-surface-dark rounded-xl p-4 flex items-center justify-between border border-gray-100 dark:border-white/5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                    <div className="bg-gray-100 dark:bg-white/10 p-2 rounded text-gray-900 dark:text-white">
                        <span className="material-symbols-outlined">credit_card</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Apple Pay</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Ending in 4242</span>
                    </div>
                </div>
                <span className="text-xs font-bold text-primary uppercase tracking-wide">Change</span>
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
                    <span className="opacity-90 font-medium">${Number(totalPrice) + 15}</span>
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
