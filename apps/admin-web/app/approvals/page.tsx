/**
 * Admin Approvals List Page
 * Approval Center 列表页面（完全按照 uiadmin/approval_center_list/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import SegmentedTabs from '@/components/admin/SegmentedTabs';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import { SkeletonList } from '@/components/admin/Skeleton';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'all';

interface Approval {
  id: string;
  type: string;
  status: string;
  merchant: {
    id: string;
    name: string;
  };
  venue: {
    id: string;
    name: string;
  } | null;
  requestedBy: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  createdAt: string;
  decidedAt: string | null;
  payloadBefore: any;
  payloadAfter: any;
}

interface ApprovalCounts {
  pending: number;
  approved: number;
  rejected: number;
}

export default function AdminApprovalsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ApprovalStatus>('pending');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [counts, setCounts] = useState<ApprovalCounts>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchApprovals();
  }, [activeTab]);
  
  const fetchApprovals = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (activeTab !== 'all') {
        params.set('status', activeTab);
      }
      
      const response = await fetch(`/api/admin/approvals?${params.toString()}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch approvals');
      }
      
      setApprovals(result.data.requests || []);
      setCounts(result.data.counts || { pending: 0, approved: 0, rejected: 0 });
    } catch (err: any) {
      console.error('[ADMIN APPROVALS] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleApprove = async (id: string) => {
    if (!confirm('Are you sure you want to approve this request?')) return;
    
    try {
      const response = await fetch(`/api/admin/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '' }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        router.refresh();
        fetchApprovals();
      } else {
        alert(result.message || 'Failed to approve request');
      }
    } catch (err: any) {
      console.error('[ADMIN APPROVALS] Approve error:', err);
      alert('Failed to approve request');
    }
  };
  
  const handleReject = async (id: string) => {
    const note = prompt('Please provide a reason for rejection:');
    if (!note) return;
    
    try {
      const response = await fetch(`/api/admin/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        router.refresh();
        fetchApprovals();
      } else {
        alert(result.message || 'Failed to reject request');
      }
    } catch (err: any) {
      console.error('[ADMIN APPROVALS] Reject error:', err);
      alert('Failed to reject request');
    }
  };
  
  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'price_change':
      case 'price':
        return 'currency_exchange';
      case 'new_event':
      case 'event_edit':
      case 'event':
        return 'edit_calendar';
      case 'inventory':
      case 'inventory_change':
        return 'inventory_2';
      default:
        return 'assignment';
    }
  };
  
  const getTypeLabel = (type: string) => {
    switch (type.toLowerCase()) {
      case 'price_change':
        return 'Price Change';
      case 'new_event':
      case 'event_edit':
        return 'Event Edit';
      case 'inventory_change':
        return 'Inventory Release';
      default:
        return type;
    }
  };
  
  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'price_change':
        return { bg: 'bg-blue-500', iconBg: 'bg-blue-50 dark:bg-blue-900/20', iconText: 'text-blue-600 dark:text-blue-400' };
      case 'new_event':
      case 'event_edit':
        return { bg: 'bg-amber-500', iconBg: 'bg-amber-50 dark:bg-amber-900/20', iconText: 'text-amber-600 dark:text-amber-400' };
      case 'inventory_change':
        return { bg: 'bg-purple-500', iconBg: 'bg-purple-50 dark:bg-purple-900/20', iconText: 'text-purple-600 dark:text-purple-400' };
      default:
        return { bg: 'bg-gray-500', iconBg: 'bg-gray-50 dark:bg-gray-900/20', iconText: 'text-gray-600 dark:text-gray-400' };
    }
  };
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(date.getTime() + 24 * 60 * 60 * 1000).toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } else if (isYesterday) {
      return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    }
  };
  
  const groupByDate = (approvals: Approval[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayItems: Approval[] = [];
    const yesterdayItems: Approval[] = [];
    const olderItems: Approval[] = [];
    
    approvals.forEach((approval) => {
      const date = new Date(approval.createdAt);
      date.setHours(0, 0, 0, 0);
      
      if (date.getTime() === today.getTime()) {
        todayItems.push(approval);
      } else if (date.getTime() === yesterday.getTime()) {
        yesterdayItems.push(approval);
      } else {
        olderItems.push(approval);
      }
    });
    
    return { todayItems, yesterdayItems, olderItems };
  };
  
  const renderApprovalCard = (approval: Approval, showActions: boolean = true) => {
    const typeColor = getTypeColor(approval.type);
    const icon = getTypeIcon(approval.type);
    const label = getTypeLabel(approval.type);
    
    // 从 payload 中提取事件/商家名称（如果可用）
    const eventName = approval.payloadAfter?.title || approval.payloadAfter?.name || 'Unknown Event';
    const merchantName = approval.merchant?.name || 'Unknown Merchant';
    
    return (
      <div
        key={approval.id}
        className="group bg-surface-light dark:bg-surface-dark rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 relative overflow-hidden"
      >
        {/* Left accent bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${typeColor.bg}`}></div>
        
        {/* Header */}
        <div className="flex justify-between items-start mb-3 pl-2">
          <div className="flex items-center gap-2 text-primary dark:text-white">
            <div className={`p-1.5 rounded-lg ${typeColor.iconBg} ${typeColor.iconText}`}>
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
            <span className="text-sm font-bold">{label}</span>
          </div>
          <span className="inline-flex items-center px-2 py-1 rounded-[2px] text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
          </span>
        </div>
        
        {/* Content */}
        <div className="pl-2 mb-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight mb-1">
            {eventName}
          </h3>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <span className="material-symbols-outlined text-[16px]">storefront</span>
            <span>{merchantName}</span>
          </div>
        </div>
        
        {/* Metadata */}
        <div className="pl-2 mb-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-gray-400">Submitted by</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {approval.requestedBy?.name || 'Unknown'}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400">Time</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono">
              {formatTime(approval.createdAt)}
            </span>
          </div>
        </div>
        
        {/* Actions */}
        {showActions && approval.status === 'pending' && (
          <div className="pl-2 grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
            <button
              onClick={() => handleReject(approval.id)}
              className="flex items-center justify-center gap-2 h-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
              Reject
            </button>
            <button
              onClick={() => handleApprove(approval.id)}
              className="flex items-center justify-center gap-2 h-10 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-blue-900/20"
            >
              <span className="material-symbols-outlined text-[18px]">check</span>
              Approve
            </button>
          </div>
        )}
      </div>
    );
  };
  
  const tabs = [
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Rejected', count: counts.rejected },
  ];
  
  const { todayItems, yesterdayItems, olderItems } = groupByDate(approvals);
  
  return (
    <div className="relative flex min-h-screen w-full flex-col mx-auto max-w-[480px] bg-background-light dark:bg-background-dark border-x border-slate-200 dark:border-slate-800 shadow-2xl">
      {/* Top App Bar - 完全按照 UI 文档 */}
      <header className="bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 z-50 shrink-0">
        <div className="h-safe-top w-full"></div>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-primary dark:text-white transition-colors">
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <h1 className="text-lg font-bold tracking-tight text-primary dark:text-white">Approval Center</h1>
          </div>
          <div className="flex items-center">
            <button className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-primary dark:text-white transition-colors">
              <span className="material-symbols-outlined text-[24px]">notifications</span>
              {counts.pending > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-surface-dark"></span>
              )}
            </button>
          </div>
        </div>
        
        {/* Segmented Tabs - 完全按照 UI 文档 */}
        <div className="px-4 pb-3">
          <div className="flex p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ApprovalStatus)}
                className={`flex-1 py-1.5 px-3 text-sm rounded-[0.2rem] text-center transition-all ${
                  activeTab === tab.id
                    ? 'font-semibold bg-white dark:bg-surface-dark text-primary dark:text-white shadow-sm'
                    : 'font-medium text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-white'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1">({tab.count})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>
      
      {/* Main Content Area - 完全按照 UI 文档 */}
      <main className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3 pb-24">
        {/* Loading State */}
        {loading && <SkeletonList count={5} />}
        
        {/* Error State */}
        {error && !loading && (
          <ErrorState message={error} onRetry={fetchApprovals} />
        )}
        
        {/* Empty State */}
        {!loading && !error && approvals.length === 0 && (
          <EmptyState
            icon="assignment_turned_in"
            title="No Approvals Found"
            description={`No ${activeTab} approvals found.`}
          />
        )}
        
        {/* Today Section */}
        {!loading && !error && todayItems.length > 0 && (
          <>
            <div className="flex items-center gap-4 py-1">
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today</span>
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
            </div>
            {todayItems.map((approval) => renderApprovalCard(approval, activeTab === 'pending'))}
          </>
        )}
        
        {/* Yesterday Section */}
        {!loading && !error && yesterdayItems.length > 0 && (
          <>
            <div className="flex items-center gap-4 py-2 pt-4">
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Yesterday</span>
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1"></div>
            </div>
            {yesterdayItems.map((approval) => renderApprovalCard(approval, activeTab === 'pending'))}
          </>
        )}
        
        {/* Older Items */}
        {!loading && !error && olderItems.length > 0 && (
          olderItems.map((approval) => renderApprovalCard(approval, activeTab === 'pending'))
        )}
      </main>
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={counts.pending} />
    </div>
  );
}
