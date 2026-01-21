/**
 * Status Badge
 * 状态标签组件（Active/Suspended/Pending/Approved/Rejected/Refund/Failed/Processing 等）
 */

'use client';

type StatusType =
  | 'active'
  | 'suspended'
  | 'closed'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'refund'
  | 'failed'
  | 'processing'
  | 'ready'
  | 'operational'
  | 'maintenance'
  | 'draft'
  | 'published'
  | 'archived';

interface StatusBadgeProps {
  status: StatusType | string | undefined | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<
  StatusType,
  { bg: string; text: string; icon?: string }
> = {
  active: {
    bg: 'bg-success-bg dark:bg-green-900/30',
    text: 'text-success-text dark:text-green-400',
    icon: 'check_circle',
  },
  suspended: {
    bg: 'bg-admin-warning-bg dark:bg-orange-900/30',
    text: 'text-admin-warning-text dark:text-orange-400',
    icon: 'pause_circle',
  },
  closed: {
    bg: 'bg-admin-neutral-bg dark:bg-slate-700',
    text: 'text-admin-neutral-text dark:text-slate-400',
    icon: 'cancel',
  },
  pending: {
    bg: 'bg-admin-warning-bg dark:bg-orange-900/30',
    text: 'text-admin-warning-text dark:text-orange-400',
    icon: 'schedule',
  },
  approved: {
    bg: 'bg-success-bg dark:bg-green-900/30',
    text: 'text-success-text dark:text-green-400',
    icon: 'check_circle',
  },
  rejected: {
    bg: 'bg-admin-error-bg dark:bg-red-900/30',
    text: 'text-admin-error-text dark:text-red-400',
    icon: 'cancel',
  },
  refund: {
    bg: 'bg-admin-warning-bg dark:bg-orange-900/30',
    text: 'text-admin-warning-text dark:text-orange-400',
    icon: 'undo',
  },
  failed: {
    bg: 'bg-admin-error-bg dark:bg-red-900/30',
    text: 'text-admin-error-text dark:text-red-400',
    icon: 'error',
  },
  processing: {
    bg: 'bg-admin-warning-bg dark:bg-orange-900/30',
    text: 'text-admin-warning-text dark:text-orange-400',
    icon: 'sync',
  },
  ready: {
    bg: 'bg-success-bg dark:bg-green-900/30',
    text: 'text-success-text dark:text-green-400',
    icon: 'check',
  },
  operational: {
    bg: 'bg-success-bg dark:bg-green-900/30',
    text: 'text-success-text dark:text-green-400',
    icon: 'check_circle',
  },
  maintenance: {
    bg: 'bg-admin-warning-bg dark:bg-orange-900/30',
    text: 'text-admin-warning-text dark:text-orange-400',
    icon: 'build',
  },
  draft: {
    bg: 'bg-admin-neutral-bg dark:bg-slate-700',
    text: 'text-admin-neutral-text dark:text-slate-400',
    icon: 'edit',
  },
  published: {
    bg: 'bg-success-bg dark:bg-green-900/30',
    text: 'text-success-text dark:text-green-400',
    icon: 'publish',
  },
  archived: {
    bg: 'bg-admin-neutral-bg dark:bg-slate-700',
    text: 'text-admin-neutral-text dark:text-slate-400',
    icon: 'archive',
  },
};

export default function StatusBadge({ status, size = 'md', className = '' }: StatusBadgeProps) {
  // 处理 undefined/null 或无效的 status 值
  if (!status) {
    return null;
  }
  
  // 转换为小写以匹配配置（处理 'Operational' -> 'operational'）
  const normalizedStatus = status.toLowerCase() as StatusType;
  const config = statusConfig[normalizedStatus] || {
    bg: 'bg-admin-neutral-bg dark:bg-slate-700',
    text: 'text-admin-neutral-text dark:text-slate-400',
    icon: 'help',
  };
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold ${config.bg} ${config.text} ${sizeClasses[size]} ${className}`}
    >
      {config.icon && (
        <span className="material-symbols-outlined text-[14px]">
          {config.icon}
        </span>
      )}
      <span className="capitalize">{status}</span>
    </span>
  );
}
