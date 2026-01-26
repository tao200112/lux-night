'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 保留旧路径，重定向到 /help */
export default function SupportPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/help');
  }, [router]);
  return (
    <div className="min-h-screen max-w-md mx-auto bg-background-dark flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}
