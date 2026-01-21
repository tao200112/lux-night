/**
 * Admin Logout Page
 * Admin Portal 登出页面
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth/client';

export default function AdminLogoutPage() {
  const router = useRouter();
  
  useEffect(() => {
    const handleLogout = async () => {
      try {
        await signOut();
        router.replace('/login');
      } catch (error) {
        console.error('[ADMIN LOGOUT] Error:', error);
        // 即使出错也重定向到登录页
        router.replace('/login');
      }
    };
    
    handleLogout();
  }, [router]);
  
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center p-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-action mx-auto mb-4"></div>
        <p className="text-primary dark:text-white">正在登出...</p>
      </div>
    </div>
  );
}
