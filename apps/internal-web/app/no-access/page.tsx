/**
 * No Access Page
 * 完全按照 uimerchant/system__no_access/code.html 设计
 */

'use client';

import { useRouter } from 'next/navigation';

export default function NoAccessPage() {
  const router = useRouter();

  const handleBackToHome = () => {
    router.push('/');
  };

  const handleSwitchWorkspace = () => {
    router.push('/workspaces');
  };

  return (
    <div className="w-full max-w-[430px] lg:max-w-6xl mx-auto bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display transition-colors duration-300">
      {/* Top Navigation */}
      <div className="flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 justify-between sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <div className="w-12 flex justify-start">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span className="material-symbols-outlined text-[#101318] dark:text-white">chevron_left</span>
          </button>
        </div>
        <h2 className="text-[#101318] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">Restricted</h2>
        <div className="w-12"></div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          {/* Graphic Illustration Container */}
          <div className="mb-10 relative flex items-center justify-center">
            <div className="absolute w-24 h-24 bg-primary/5 dark:bg-primary/20 rounded-full scale-150 blur-xl"></div>
            <div className="relative w-20 h-20 bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex items-center justify-center border border-gray-100 dark:border-gray-700">
              <span className="material-symbols-outlined text-primary dark:text-blue-400 !text-4xl">shield_lock</span>
            </div>
          </div>

          {/* Empty State Content */}
          <div className="flex flex-col items-center gap-3 mb-10">
            <h1 className="text-[#101318] dark:text-white text-2xl font-bold leading-tight tracking-[-0.025em]">
              No Access
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-base font-normal leading-relaxed max-w-[280px]">
              You don't have permission to view this page. Contact your administrator if you believe this is an error.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full space-y-3">
            {/* Primary Action */}
            <button
              onClick={handleBackToHome}
              className="w-full flex cursor-pointer items-center justify-center overflow-hidden rounded-xl h-14 px-6 bg-primary text-white text-base font-bold leading-normal tracking-[0.015em] shadow-lg shadow-primary/20 active:scale-95 transition-transform"
            >
              <span className="truncate">Back to Home</span>
            </button>

            {/* Secondary Action */}
            <button
              onClick={handleSwitchWorkspace}
              className="w-full flex cursor-pointer items-center justify-center overflow-hidden rounded-xl h-14 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#101318] dark:text-white text-base font-bold leading-normal tracking-[0.015em] active:scale-95 transition-transform"
            >
              <span className="truncate">Switch Workspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
