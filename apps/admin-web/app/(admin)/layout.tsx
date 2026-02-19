/**
 * Admin Layout
 * Responsive: mobile = bottom nav + 480px; desktop (lg+) = sidebar + full width
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import AdminSidebar from '@/components/admin/AdminSidebar';
import '../admin.css';

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
    redirect('/no-access');
  }
  
  const { count: pendingCount } = await supabase
    .from('requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  
  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-background-light dark:bg-background-dark">
      <AdminSidebar pendingCount={pendingCount || 0} />
      <div className="flex-1 flex flex-col min-w-0 w-full">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-6">
          {children}
        </main>
        <AdminBottomNav pendingCount={pendingCount || 0} />
      </div>
    </div>
  );
}
