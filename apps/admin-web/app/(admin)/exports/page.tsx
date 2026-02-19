/**
 * Admin Exports Page
 * Data Export Center 页面（完全按照 uiadmin/data_export_center/code.html 重写）
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageContainer from '@/components/admin/PageContainer';
import ErrorState from '@/components/admin/ErrorState';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonList } from '@/components/admin/Skeleton';

interface ExportTask {
  id: string;
  dataType: string;
  fileName: string;
  status: 'ready' | 'processing' | 'failed';
  fileUrl: string | null;
  fileSizeBytes: number | null;
  fileSizeFormatted: string | null;
  regionId: string | null;
  merchantId: string | null;
  filters: Record<string, any>;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface Region {
  id: string;
  name: string;
}

export default function AdminExportsPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [dataType, setDataType] = useState('Orders');
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [region, setRegion] = useState('');
  const [format, setFormat] = useState('CSV');
  const [merchant, setMerchant] = useState('');
  
  useEffect(() => {
    fetchTasks();
    fetchRegions();
  }, []);
  
  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/exports');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch export tasks');
      }
      
      setTasks(result.data.tasks || []);
    } catch (err: any) {
      console.error('[ADMIN EXPORTS] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchRegions = async () => {
    try {
      const response = await fetch('/api/admin/merchants');
      const result = await response.json();
      
      if (result.success && result.data.regions) {
        setRegions(result.data.regions || []);
      }
    } catch (err) {
      console.error('[ADMIN EXPORTS] Error fetching regions:', err);
    }
  };
  
  const handleGenerateReport = async () => {
    try {
      setCreating(true);
      
      const response = await fetch('/api/admin/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataType,
          region: region || null,
          merchant: merchant || null,
          format: format.toLowerCase(),
          dateRange,
          filters: {},
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create export task');
      }
      
      // 刷新列表
      await fetchTasks();
      
      // 重置表单
      setDataType('Orders');
      setDateRange('Last 30 Days');
      setRegion('');
      setFormat('CSV');
      setMerchant('');
      
      alert('Export task created successfully!');
    } catch (err: any) {
      console.error('[ADMIN EXPORTS CREATE] Error:', err);
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };
  
  const handleDownload = (task: ExportTask) => {
    if (task.fileUrl) {
      window.open(task.fileUrl, '_blank');
    } else {
      alert('File not ready yet');
    }
  };
  
  const handleRetry = async (taskId: string) => {
    // TODO: 实现重试逻辑
    alert('Retry functionality coming soon');
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
  
  const getDataTypeIcon = (dataType: string) => {
    const iconMap: Record<string, string> = {
      'Orders': 'description',
      'Merchants': 'table_view',
      'Events': 'event',
      'Customers': 'group',
    };
    return iconMap[dataType] || 'file_download';
  };
  
  return (
    <PageContainer className="bg-background-light dark:bg-background-dark font-display text-text-main dark:text-gray-100 flex flex-col antialiased">
      {/* Header - 完全按照 UI 文档 */}
      <header className="sticky top-0 z-50 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 text-text-main dark:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
          </button>
          <h1 className="text-lg font-bold tracking-tight text-primary dark:text-white">Data Export</h1>
        </div>
        <button className="text-primary-active font-medium text-sm">Help</button>
      </header>
      
      {/* Main Content - 完全按照 UI 文档 */}
      <main className="flex-1 w-full max-w-lg mx-auto p-4 flex flex-col gap-6">
        {/* Export Configuration Card - 完全按照 UI 文档 */}
        <section className="bg-surface-light dark:bg-surface-dark rounded-sm border border-border-light dark:border-border-dark shadow-sm">
          <div className="px-4 py-3 border-b border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-gray-800/30">
            <h2 className="text-primary dark:text-white text-sm font-semibold uppercase tracking-wide">
              New Report Configuration
            </h2>
          </div>
          
          <div className="p-4 space-y-5">
            {/* Data Type Selector - 完全按照 UI 文档 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Data Type</label>
              <div className="flex flex-wrap gap-2">
                {['Orders', 'Merchants', 'Events', 'Customers'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setDataType(type)}
                    className={`flex-1 min-w-[80px] h-9 px-3 text-xs font-medium rounded-sm border transition-all ${
                      dataType === type
                        ? 'border-primary-active bg-primary-active/10 text-primary-active'
                        : 'border-border-light dark:border-border-dark bg-white dark:bg-surface-dark text-text-secondary hover:border-primary-active hover:text-primary-active'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Filters Stack - 完全按照 UI 文档 */}
            <div className="space-y-4">
              {/* Date Range */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Date Range</label>
                <div className="relative">
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full appearance-none bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main dark:text-gray-200 text-sm rounded-sm py-2.5 pl-3 pr-10 focus:outline-none focus:ring-1 focus:ring-primary-active focus:border-primary-active transition-shadow"
                  >
                    <option>Last 30 Days</option>
                    <option>Last 7 Days</option>
                    <option>Last Quarter</option>
                    <option>Custom Range</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary">
                    <span className="material-symbols-outlined text-xl">calendar_today</span>
                  </div>
                </div>
              </div>
              
              {/* Region & Format (Grid) - 完全按照 UI 文档 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Region</label>
                  <div className="relative">
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full appearance-none bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main dark:text-gray-200 text-sm rounded-sm py-2.5 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-primary-active focus:border-primary-active transition-shadow"
                    >
                      <option value="">Global</option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary">
                      <span className="material-symbols-outlined text-lg">expand_more</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Format</label>
                  <div className="relative">
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="w-full appearance-none bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main dark:text-gray-200 text-sm rounded-sm py-2.5 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-primary-active focus:border-primary-active transition-shadow"
                    >
                      <option>CSV</option>
                      <option>XLSX</option>
                      <option>JSON</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary">
                      <span className="material-symbols-outlined text-lg">expand_more</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Merchant Picker - 完全按照 UI 文档 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Merchant Filter (Optional)
                </label>
                <div className="relative group cursor-pointer">
                  <input
                    type="text"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="Search specific merchant ID..."
                    className="w-full bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main dark:text-gray-200 text-sm rounded-sm py-2.5 pl-9 pr-3 focus:outline-none focus:ring-1 focus:ring-primary-active focus:border-primary-active transition-shadow group-hover:border-primary/40"
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center px-2.5 text-text-secondary">
                    <span className="material-symbols-outlined text-lg">search</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Primary Action - 完全按照 UI 文档 */}
            <button
              onClick={handleGenerateReport}
              disabled={creating}
              className="w-full bg-primary-active hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm py-3 rounded-sm shadow-sm active:shadow-inner transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-lg">bolt</span>
              Generate Report
            </button>
          </div>
        </section>
        
        {/* Export History List - 完全按照 UI 文档 */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-primary dark:text-white font-semibold text-base">Recent Activity</h3>
            <button className="text-primary-active text-xs font-medium">View All</button>
          </div>
          
          {/* Loading State */}
          {loading && <SkeletonList count={3} />}
          
          {/* Error State */}
          {error && !loading && (
            <ErrorState message={error} onRetry={fetchTasks} />
          )}
          
          {/* Empty State */}
          {!loading && !error && tasks.length === 0 && (
            <EmptyState
              icon="file_download"
              title="No Export Tasks"
              description="No export tasks found. Create one above."
            />
          )}
          
          {/* Tasks List - 完全按照 UI 文档 */}
          {!loading && !error && tasks.length > 0 && (
            <div className="bg-surface-light dark:bg-surface-dark rounded-sm border border-border-light dark:border-border-dark divide-y divide-border-light dark:divide-border-dark shadow-sm">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 flex items-center justify-between group active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-text-secondary text-base">
                        {getDataTypeIcon(task.dataType)}
                      </span>
                      <span className="text-sm font-medium text-text-main dark:text-white truncate">
                        {task.fileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-xs text-text-secondary">
                        {formatDate(task.createdAt)}
                      </span>
                      {task.fileSizeFormatted && (
                        <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-text-secondary font-medium">
                          {task.fileSizeFormatted}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      task.status === 'ready'
                        ? 'bg-status-success-bg text-status-success-text'
                        : task.status === 'processing'
                        ? 'bg-status-pending-bg text-status-pending-text animate-pulse'
                        : 'bg-status-error-bg text-status-error-text'
                    }`}>
                      {task.status === 'ready' ? 'Ready' : task.status === 'processing' ? 'Processing' : 'Failed'}
                    </span>
                    
                    {task.status === 'ready' && (
                      <button
                        onClick={() => handleDownload(task)}
                        className="text-primary-active hover:text-blue-700 p-1"
                      >
                        <span className="material-symbols-outlined text-xl">download</span>
                      </button>
                    )}
                    
                    {task.status === 'processing' && (
                      <div className="p-1">
                        <span className="material-symbols-outlined text-xl text-text-secondary animate-spin">
                          progress_activity
                        </span>
                      </div>
                    )}
                    
                    {task.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(task.id)}
                        className="text-text-secondary hover:text-primary-active p-1"
                      >
                        <span className="material-symbols-outlined text-xl">refresh</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </PageContainer>
  );
}
