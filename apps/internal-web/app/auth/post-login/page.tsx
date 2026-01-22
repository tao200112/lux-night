/**
 * Post-Login Page
 * 
 * OAuth 回调成功后的处理页面
 * 1. 检查用户是否有 merchant membership
 * 2. 有 membership -> 跳转到 workspaces
 * 3. 无 membership -> 跳转到 invite（需要邀请码）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { consumePostAuthRedirect } from '@lux-night/shared/auth';
import { APP_NAME, DEFAULT_AFTER_LOGIN } from '@/lib/auth/client';

export default function PostLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkMembershipAndRedirect() {
      try {
        setChecking(true);
        
        const supabase = createClient();
        
        // 1. 获取当前用户
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          console.error('[PostLogin] No user found, redirecting to login:', userError);
          router.replace('/login');
          return;
        }

        console.log('[PostLogin] User authenticated:', user.id);

        // 2. 检查用户是否有 active merchant membership
        const { data: memberships, error: membershipError } = await supabase
          .from('merchant_members')
          .select('id, merchant_id, role')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1);

        if (membershipError) {
          console.error('[PostLogin] Error checking membership:', membershipError);
          // 如果查询出错，默认跳转到 invite（安全选择）
          router.replace('/invite?reason=query_error');
          return;
        }

        console.log('[PostLogin] Membership check result:', {
          hasMembership: memberships && memberships.length > 0,
          count: memberships?.length || 0,
        });

        // 3. 根据 membership 决定跳转目标
        if (memberships && memberships.length > 0) {
          // ✅ 有 membership - 跳转到工作台（或用户之前想去的地方）
          const targetPath = consumePostAuthRedirect(APP_NAME, DEFAULT_AFTER_LOGIN);
          
          console.log('[PostLogin] Has membership, redirecting to:', targetPath);
          router.replace(targetPath);
        } else {
          // ❌ 无 membership - 跳转到邀请码页面
          console.log('[PostLogin] No membership, redirecting to /invite');
          
          // 清除可能存储的目标路径（因为没有权限访问）
          consumePostAuthRedirect(APP_NAME, '/');
          
          router.replace('/invite?reason=no_membership');
        }
      } catch (error) {
        console.error('[PostLogin] Unexpected error:', error);
        router.replace('/invite?reason=error');
      } finally {
        setChecking(false);
      }
    }

    checkMembershipAndRedirect();
  }, [router]);

  if (!checking) {
    return null; // 避免闪烁
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1212]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-sm text-gray-400">Completing login...</p>
        <p className="text-xs text-gray-500 mt-2">Checking your membership...</p>
      </div>
    </div>
  );
}
