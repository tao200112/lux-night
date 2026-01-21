/**
 * Staff Management List Page
 * 完全按照 uimerchant/staff_management_list/code.html 设计
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type FilterType = 'All Members' | 'Managers' | 'Staff' | 'Security';

export default function StaffPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('All Members');
  const [searchQuery, setSearchQuery] = useState('');

  const staffMembers = [
    { id: '1', name: 'Alex Rivera', role: 'Manager', lastActive: '15m ago', active: true, avatar: '' },
    { id: '2', name: 'Jordan Smith', role: 'Staff', lastActive: '4h ago', active: false, avatar: '' },
    { id: '3', name: 'Marcus Chen', role: 'Staff', lastActive: '2m ago', active: true, avatar: '' },
  ];

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
        <div className="space-y-3">
          {staffMembers.map((member) => (
            <div 
              key={member.id}
              className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="size-14 rounded-full bg-gray-200 dark:bg-gray-800 border-2 border-primary/30 flex items-center justify-center">
                    <span className="text-gray-600 dark:text-gray-400 text-lg font-bold">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div className={`absolute bottom-0 right-0 size-4 border-2 border-white dark:border-gray-900 rounded-full ${member.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-base">{member.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      member.role === 'Manager'
                        ? 'bg-yellow-200/30 text-yellow-800 dark:text-yellow-200'
                        : 'bg-blue-200/30 text-blue-800 dark:text-blue-200'
                    }`}>
                      {member.role}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Last active: {member.lastActive}</p>
                </div>
              </div>
              <label className="relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full bg-[#e8f0f2] dark:bg-gray-700 p-0.5 transition-colors has-[:checked]:bg-primary">
                <input defaultChecked={member.active} className="invisible absolute peer" type="checkbox"/>
                <div className="h-full w-[27px] rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-[20px]"></div>
              </label>
            </div>
          ))}
        </div>
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
