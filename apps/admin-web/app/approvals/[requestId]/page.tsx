/**
 * Admin Approval Detail Page
 * Approval Detail 对比页面（完全按照 uiadmin/approval_detail_comparison/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import AdminBottomNav from '@/components/admin/AdminBottomNav';
import ErrorState from '@/components/admin/ErrorState';
import { Skeleton } from '@/components/admin/Skeleton';

interface ApprovalDetail {
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
  event: {
    id: string;
    title: string;
  } | null;
  requestedBy: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  } | null;
  payloadBefore: any;
  payloadAfter: any;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export default function AdminApprovalDetailPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.requestId as string;
  
  const [approval, setApproval] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [note, setNote] = useState('');
  
  useEffect(() => {
    fetchApprovalDetail();
  }, [requestId]);
  
  const fetchApprovalDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/admin/approvals/${requestId}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch approval detail');
      }
      
      setApproval(result.data);
    } catch (err: any) {
      console.error('[ADMIN APPROVAL DETAIL] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleApprove = async () => {
    if (!note.trim()) {
      alert('Please enter a note (required for audit log)');
      return;
    }
    
    if (!confirm('Are you sure you want to approve this request?')) return;
    
    try {
      setProcessing(true);
      
      const response = await fetch(`/api/admin/approvals/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to approve request');
      }
      
      router.push('/approvals');
    } catch (err: any) {
      console.error('[ADMIN APPROVAL APPROVE] Error:', err);
      alert(err.message);
      setProcessing(false);
    }
  };
  
  const handleReject = async () => {
    if (!note.trim()) {
      alert('Please enter a note (required for audit log)');
      return;
    }
    
    if (!confirm('Are you sure you want to reject this request?')) return;
    
    try {
      setProcessing(true);
      
      const response = await fetch(`/api/admin/approvals/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to reject request');
      }
      
      router.push('/approvals');
    } catch (err: any) {
      console.error('[ADMIN APPROVAL REJECT] Error:', err);
      alert(err.message);
      setProcessing(false);
    }
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };
  
  const getDiffFields = () => {
    if (!approval || !approval.payloadAfter) return [];
    
    const after = approval.payloadAfter;
    const before = approval.payloadBefore || {};
    const fields: Array<{ key: string; label: string; before: any; after: any; icon: string; format: 'price' | 'date' | 'number' | 'text' }> = [];
    
    // 提取常见字段
    if (after.price_cents !== undefined) {
      fields.push({
        key: 'price_cents',
        label: 'Ticket Price (USD)',
        before: before.price_cents,
        after: after.price_cents,
        icon: 'payments',
        format: 'price',
      });
    }
    
    if (after.inventory_limit !== undefined) {
      fields.push({
        key: 'inventory_limit',
        label: 'Inventory Count',
        before: before.inventory_limit,
        after: after.inventory_limit,
        icon: 'inventory_2',
        format: 'number',
      });
    }
    
    if (after.start_at !== undefined) {
      fields.push({
        key: 'start_at',
        label: 'Event Start Time',
        before: before.start_at,
        after: after.start_at,
        icon: 'event',
        format: 'date',
      });
    }
    
    if (after.title !== undefined) {
      fields.push({
        key: 'title',
        label: 'Event Title',
        before: before.title,
        after: after.title,
        icon: 'title',
        format: 'text',
      });
    }
    
    return fields;
  };
  
  const formatValue = (value: any, format: 'price' | 'date' | 'number' | 'text'): string => {
    if (value === null || value === undefined) return '—';
    
    switch (format) {
      case 'price':
        return `$${(Number(value) / 100).toFixed(2)}`;
      case 'date':
        try {
          const date = new Date(value);
          return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
        } catch {
          return String(value);
        }
      case 'number':
        return Number(value).toLocaleString();
      default:
        return String(value);
    }
  };
  
  const calculateChange = (before: any, after: any, format: 'price' | 'date' | 'number' | 'text'): string | null => {
    if (before === null || before === undefined || after === null || after === undefined) return null;
    
    if (format === 'price') {
      const beforePrice = Number(before) / 100;
      const afterPrice = Number(after) / 100;
      if (beforePrice === 0) return null;
      const change = ((afterPrice - beforePrice) / beforePrice) * 100;
      return change > 0 ? `+${change.toFixed(0)}%` : `${change.toFixed(0)}%`;
    }
    
    if (format === 'number') {
      const beforeNum = Number(before);
      const afterNum = Number(after);
      if (beforeNum === 0) return null;
      const change = ((afterNum - beforeNum) / beforeNum) * 100;
      return change > 0 ? `+${change.toFixed(0)}%` : `${change.toFixed(0)}%`;
    }
    
    return null;
  };
  
  if (loading) {
    return (
      <div className="relative flex min-h-screen flex-col pb-[240px] max-w-[480px] mx-auto bg-background-light dark:bg-background-dark">
        <div className="sticky top-0 z-30 bg-primary shadow-md">
          <div className="flex items-center justify-between px-4 py-3">
            <button className="flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors">
              <span className="material-symbols-outlined text-2xl">arrow_back</span>
            </button>
            <div className="flex flex-col items-center">
              <h1 className="text-white text-base font-semibold tracking-tight">Loading...</h1>
            </div>
            <div className="flex size-10 items-center justify-center"></div>
          </div>
        </div>
        <main className="px-4 py-6">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }
  
  if (error || !approval) {
    return (
      <div className="relative flex min-h-screen flex-col pb-[240px] max-w-[480px] mx-auto bg-background-light dark:bg-background-dark">
        <div className="sticky top-0 z-30 bg-primary shadow-md">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => router.back()}
              className="flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-2xl">arrow_back</span>
            </button>
            <div className="flex flex-col items-center">
              <h1 className="text-white text-base font-semibold tracking-tight">Error</h1>
            </div>
            <div className="flex size-10 items-center justify-center"></div>
          </div>
        </div>
        <main className="px-4 py-6">
          <ErrorState message={error || 'Approval not found'} onRetry={fetchApprovalDetail} />
        </main>
      </div>
    );
  }
  
  const diffFields = getDiffFields();
  
  return (
    <div className="relative flex min-h-screen flex-col pb-[240px] max-w-[480px] mx-auto bg-background-light dark:bg-background-dark">
      {/* Top App Bar - 完全按照 UI 文档 */}
      <header className="sticky top-0 z-30 bg-primary shadow-md">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-white text-base font-semibold tracking-tight">
              Approval #{requestId.slice(0, 8).toUpperCase()}
            </h1>
            <span className="text-xs text-slate-300 font-medium opacity-80">Global Admin Portal</span>
          </div>
          <div className="flex size-10 items-center justify-center">
            <span className="material-symbols-outlined text-white/80">more_vert</span>
          </div>
        </div>
        
        {/* Quick Context Bar - 完全按照 UI 文档 */}
        <div className="bg-primary-dark px-6 py-3 border-t border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${
              approval.status === 'pending'
                ? 'bg-yellow-400 animate-pulse'
                : approval.status === 'approved'
                ? 'bg-green-400'
                : 'bg-red-400'
            }`}></div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white">
              {approval.status === 'pending' ? 'Pending Review' : approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">REQ-{requestId.slice(0, 8).toUpperCase()}</span>
        </div>
      </header>
      
      {/* Main Content Area - 完全按照 UI 文档 */}
      <main className="flex-1 px-4 py-6 flex flex-col gap-6">
        {/* Metadata Section */}
        <section className="grid grid-cols-2 gap-3">
          <div className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-border-light dark:border-border-dark shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-slate-400 text-sm">storefront</span>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Merchant</p>
            </div>
            <p className="text-sm font-semibold truncate">{approval.merchant?.name || 'Unknown'}</p>
          </div>
          <div className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-border-light dark:border-border-dark shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-slate-400 text-sm">schedule</span>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Timestamp</p>
            </div>
            <p className="text-sm font-semibold truncate">{formatDate(approval.createdAt)}</p>
          </div>
        </section>
        
        {/* Section Header */}
        <div className="flex items-end justify-between border-b border-border-light dark:border-border-dark pb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Proposed Changes</h3>
          <span className="text-xs text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
            {diffFields.length} Field{diffFields.length !== 1 ? 's' : ''} Modified
          </span>
        </div>
        
        {/* Comparison Cards - 完全按照 UI 文档 */}
        {diffFields.length > 0 ? (
          diffFields.map((field) => (
            <article
              key={field.key}
              className="group relative overflow-hidden rounded-xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm"
            >
              {/* Field Label */}
              <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-border-light dark:border-border-dark flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {field.label}
                </span>
                <span className="material-symbols-outlined text-slate-400 text-sm">{field.icon}</span>
              </div>
              
              {/* Before/After Comparison */}
              {field.format === 'date' ? (
                /* Date Format - Vertical Stack */
                <div className="flex flex-col">
                  <div className="p-3 flex items-center justify-between border-b border-dashed border-border-light dark:border-border-dark opacity-60">
                    <span className="text-[10px] uppercase font-bold text-slate-400 w-16">Original</span>
                    <span className="text-sm font-mono text-slate-600 dark:text-slate-400 text-right">
                      {formatValue(field.before, field.format)}
                    </span>
                  </div>
                  <div className="p-3 flex items-center justify-between bg-amber-50/50 dark:bg-amber-900/10">
                    <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 w-16">Change</span>
                    <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200 text-right">
                      {formatValue(field.after, field.format)}
                    </span>
                  </div>
                </div>
              ) : (
                /* Price/Number Format - Grid Columns */
                <div className="grid grid-cols-2 divide-x divide-border-light dark:divide-border-dark">
                  {/* Before */}
                  <div className="p-4 flex flex-col gap-1 opacity-60">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Original</span>
                    <span className="text-lg font-mono text-slate-600 dark:text-slate-400 line-through decoration-slate-400/50">
                      {formatValue(field.before, field.format)}
                    </span>
                  </div>
                  {/* After */}
                  <div className="p-4 flex flex-col gap-1 bg-blue-50/50 dark:bg-blue-900/10 relative">
                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">Requested</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold font-mono text-blue-700 dark:text-blue-300">
                        {formatValue(field.after, field.format)}
                      </span>
                      {calculateChange(field.before, field.after, field.format) && (
                        <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          calculateChange(field.before, field.after, field.format)?.startsWith('+')
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                        }`}>
                          {calculateChange(field.before, field.after, field.format)}
                        </span>
                      )}
                    </div>
                    {/* Decorative Arrow Indicator */}
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full p-0.5 z-10 shadow-sm">
                      <span className="material-symbols-outlined text-blue-500 text-sm block">arrow_forward</span>
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
            No changes to display
          </div>
        )}
        
        {/* Venue Location (Optional) - 如果 UI 文档有 */}
        {approval.venue && (
          <div className="mt-2">
            <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Venue Location</p>
            <div className="h-32 w-full rounded-lg overflow-hidden relative border border-border-light dark:border-border-dark shadow-inner bg-slate-200 dark:bg-slate-700 opacity-50 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <span className="material-symbols-outlined text-red-500 text-3xl drop-shadow-md">location_on</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm mt-1">
                  {approval.venue.name}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Sticky Bottom Action Bar - 完全按照 UI 文档 */}
      {approval.status === 'pending' && (
        <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-surface-dark border-t border-border-light dark:border-border-dark shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-safe max-w-[480px] mx-auto">
          <div className="p-4 flex flex-col gap-4 w-full">
            {/* Notes Input */}
            <div className="relative">
              <label htmlFor="notes" className="sr-only">Review Notes</label>
              <textarea
                id="notes"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add required notes for audit log..."
                rows={2}
                className="block w-full rounded-lg border-0 bg-slate-100 dark:bg-slate-800 py-3 px-4 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 resize-none"
              />
              <div className="absolute right-2 bottom-2 text-[10px] text-slate-400 font-medium">REQUIRED</div>
            </div>
            
            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleReject}
                disabled={processing || !note.trim()}
                className="group relative flex w-full items-center justify-center gap-2 rounded-lg bg-white dark:bg-transparent border-2 border-red-100 dark:border-red-900/30 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform">close</span>
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={processing || !note.trim()}
                className="group relative flex w-full items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform">check</span>
                Approve
              </button>
            </div>
          </div>
          {/* iOS Home Indicator Spacing */}
          <div className="h-6 w-full bg-white dark:bg-surface-dark"></div>
        </footer>
      )}
      
      {/* Bottom Navigation - 使用统一组件 */}
      <AdminBottomNav pendingCount={0} />
    </div>
  );
}
