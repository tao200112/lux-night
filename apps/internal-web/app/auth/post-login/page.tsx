/**
 * Post-Login Page
 * 
 * OAuth 回调成功后的处理页面
 * 读取 localStorage 中存储的目标路径，然后跳转
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { consumePostAuthRedirect } from '@lux-night/shared/auth';
import { APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';

export default function PostLoginPage() {
  const router = useRouter();

  useEffect(() => {
    // 读取并消费登录前存储的目标路径
    const targetPath = consumePostAuthRedirect(APP_NAME, DEFAULT_AFTER_LOGIN);
    
    console.log('[PostLogin] Redirecting to:', targetPath);
    
    // 使用 replace 避免返回按钮回到这个页面
    router.replace(targetPath);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-sm text-gray-400">Completing login...</p>
      </div>
    </div>
  );
}
