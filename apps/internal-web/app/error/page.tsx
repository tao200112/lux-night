/**
 * System Error & Retry Page
 * 完全按照 uimerchant/system__error_&_retry/code.html 设计
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ErrorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get('message') || 'We couldn\'t load the data. Check your connection or server status.';

  const handleRetry = () => {
    // 重试：返回上一页或刷新当前页
    if (window.history.length > 1) {
      router.back();
    } else {
      window.location.reload();
    }
  };

  const handleHome = () => {
    router.push('/');
  };

  return (
    <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display transition-colors duration-300">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-4 py-4 bg-background-light dark:bg-background-dark border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center space-x-2">
          <span className="material-symbols-outlined text-primary text-2xl">nightlife</span>
          <span className="text-sm font-bold tracking-tight text-gray-900 dark:text-white uppercase">Venue OS</span>
        </div>
        <button
          onClick={handleHome}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </header>

      {/* Main Content Area: Centered Layout */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* Distinctive Iconography */}
          <div className="mb-8 w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-4xl leading-none">cloud_off</span>
            </div>
          </div>

          {/* Headline Text */}
          <h1 className="text-gray-900 dark:text-white text-3xl font-bold leading-tight tracking-tight text-center mb-3">
            Something went wrong
          </h1>

          {/* Body Text */}
          <p className="text-gray-500 dark:text-gray-400 text-base font-normal leading-relaxed text-center mb-10 max-w-[280px]">
            {message}
          </p>

          {/* Action Area */}
          <div className="w-full space-y-4">
            {/* SingleButton: Retry */}
            <button
              onClick={handleRetry}
              className="w-full h-14 flex items-center justify-center rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.98] transition-all text-white text-lg font-semibold shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined mr-2 text-[20px]">refresh</span>
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer Meta */}
      <footer className="pb-12 px-6 flex flex-col items-center">
        {/* MetaText: Contact Support */}
        <a
          href="mailto:support@luxnight.com"
          className="group flex items-center space-x-1 text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-primary transition-colors duration-200"
        >
          <span className="text-sm font-medium underline underline-offset-4 decoration-gray-300 dark:decoration-gray-700 group-hover:decoration-primary">
            Contact Support
          </span>
          <span className="material-symbols-outlined text-sm">arrow_outward</span>
        </a>
        <div className="mt-8 flex items-center space-x-4 opacity-30 grayscale">
          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
        </div>
      </footer>
    </div>
  );
}

// Wrap with Suspense to handle useSearchParams()
export default function ErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <ErrorPageContent />
    </Suspense>
  );
}
