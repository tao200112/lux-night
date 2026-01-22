/**
 * Staff Management List Page
 * 完全按照 uimerchant/staff_management_list/code.html 设计
 * 使用真实数据，不允许假数据
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type FilterType = 'All Members' | 'Managers' | 'Staff' | 'Security';

interface StaffMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  avatar_url?: string | null;
  initials: string;
  last_active: string | null;
}

export default function StaffPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('All Members');
  const [searchQuery, setSearchQuery] = useState('');
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStaff();
  }, [filter]);

  const loadStaff = async () => {
    try {
      setLoading(true);
      setError(null);

      // 根据 filter 确定 role 参数
      const roleParam = filter === 'All Members' ? 'All' : filter;

      const res = await fetch(`/api/merchant/staff?role=${roleParam}`, {
        credentials: 'include',
      });

      const data = await res.json();

      // 检查新的返回结构
      if (!res.ok || !data.success) {
        const errorMsg = data.error?.message || data.message || `Failed to load staff (${res.status})`;
        throw new Error(errorMsg);
      }

      setStaffMembers(data.staff || []);

      // DEBUG: 开发环境打印数据
      if (process.env.NODE_ENV === 'development') {
        console.log('[STAFF PAGE] Loaded staff:', {
          filter,
          count: data.staff?.length || 0,
          staff: data.staff,
        });
      }
    } catch (err: any) {
      console.error('[STAFF PAGE] Load staff error:', err);
      setError(err.message || 'Failed to load staff');
      setStaffMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (memberId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/staff/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !currentActive }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update staff status');
      }

      // 重新加载列表
      await loadStaff();
    } catch (err: any) {
      console.error('[STAFF PAGE] Toggle active error:', err);
      alert(`Failed to update staff status: ${err.message}`);
    }
  };

  // 根据搜索查询过滤
  const filteredMembers = staffMembers.filter((member) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      member.name.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query) ||
      member.role.toLowerCase().includes(query)
    );
  });

  return (
    <div className="w-full max-w-[430px] mx-auto bg-background-light dark:bg-background-dark font-display text-[#0f171a] dark:text-gray-100 min-h-screen pb-32">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center p-4 justify-between max-w-md mx-auto">
          <button 
            onClick={() => router.back()}
            className="w-10 flex items-center justify-start"
          >
            <span className="material-symbols-outlined text-gray-600 dark:text-gray-400 cursor-pointer">arrow_back_ios</span>
          </button>
          <h2 className="text-lg font-semibold tracking-tight">Staff Management</h2>
          <div className="w-10 flex items-center justify-end">
            <span className="material-symbols-outlined text-gray-600 dark:text-gray-400 cursor-pointer">filter_list</span>
          </div>
        </div>
      </nav>

      <main className="max-w-md mx-auto px-4 pt-6">
        {/* Search Bar */}
        <div className="mb-6">
          <label className="flex items-center h-12 w-full bg-gray-100 dark:bg-gray-800 rounded-xl px-4 focus-within:ring-2 ring-primary/50 transition-all">
            <span className="material-symbols-outlined text-gray-400 mr-2">search</span>
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-base placeholder:text-gray-500" 
              placeholder="Search staff members..." 
              type="text"
            />
          </label>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
          {(['All Members', 'Managers', 'Staff', 'Security'] as FilterType[]).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium transition-all ${
                filter === filterType
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              }`}
            >
              {filterType}
            </button>
          ))}
        </div>

        {/* Staff List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-alert-red text-center mb-4">{error}</p>
            <button
              onClick={loadStaff}
              className="px-4 py-2 bg-primary text-white rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="material-symbols-outlined text-gray-400 text-6xl mb-4">group_off</span>
            <p className="text-gray-500 dark:text-gray-400 text-center mb-2">No staff members found</p>
            {searchQuery && (
              <p className="text-gray-400 dark:text-gray-500 text-sm text-center">Try a different search term</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMembers.map((member) => {
              // 映射角色显示名称
              const roleDisplayName = member.role === 'MANAGER' ? 'Manager' :
                                     member.role === 'STAFF' ? 'Staff' :
                                     member.role === 'SECURITY' ? 'Security' :
                                     member.role;

              return (
                <div 
                  key={member.id}
                  className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={member.name}
                          className="size-14 rounded-full border-2 border-primary/30 object-cover"
                        />
                      ) : (
                        <div className="size-14 rounded-full bg-gray-200 dark:bg-gray-800 border-2 border-primary/30 flex items-center justify-center">
                          <span className="text-gray-600 dark:text-gray-400 text-lg font-bold">
                            {member.initials}
                          </span>
                        </div>
                      )}
                      <div className={`absolute bottom-0 right-0 size-4 border-2 border-white dark:border-gray-900 rounded-full ${member.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-base">{member.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          member.role === 'MANAGER'
                            ? 'bg-yellow-200/30 text-yellow-800 dark:text-yellow-200'
                            : 'bg-blue-200/30 text-blue-800 dark:text-blue-200'
                        }`}>
                          {roleDisplayName}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Last active: {member.last_active || '—'}
                      </p>
                    </div>
                  </div>
                  <label className="relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full bg-[#e8f0f2] dark:bg-gray-700 p-0.5 transition-colors has-[:checked]:bg-primary">
                    <input
                      checked={member.is_active}
                      onChange={() => handleToggleActive(member.id, member.is_active)}
                      className="invisible absolute peer"
                      type="checkbox"
                    />
                    <div className="h-full w-[27px] rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-[20px]"></div>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Fixed Bottom CTA - 移动端固定宽度 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-4 pb-8 z-50">
        <div className="max-w-md mx-auto">
          <Link 
            href="/invites/create"
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-14 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined">person_add</span>
            Generate Invite
          </Link>
        </div>
      </div>
    </div>
  );
}
