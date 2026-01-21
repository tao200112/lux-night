/**
 * Admin Layout
 * Admin Portal 布局组件（包含权限检查和统一底部导航）
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import '../../admin.css';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  
  // 检查认证
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect('/login');
  }
  
  // 检查 Admin 权限（使用 RPC 函数）
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  
  if (adminError || !isAdmin) {
    // 非 admin 用户重定向到 no-access 页面
    redirect('/no-access');
  }
  
  // 获取 pending approvals count（用于底部导航 badge）
  const { count: pendingCount } = await supabase
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  
  return (
    <div className="relative flex min-h-screen w-full flex-col mx-auto max-w-[480px] bg-background-light dark:bg-background-dark border-x border-slate-200 dark:border-slate-800 shadow-2xl">
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
        {children}
      </main>
      <AdminBottomNav pendingCount={pendingCount || 0} />
    </div>
  );
}
