/**
 * List Item Card
 * 列表项卡片组件（用于 Merchant/Order/Customer/Approval item）
 */

'use client';

import Link from 'next/link';
import StatusBadge from './StatusBadge';

interface ListItemCardProps {
  href?: string;
  title: string;
  subtitle?: string;
  description?: string;
  status?: Parameters<typeof StatusBadge>[0]['status'];
  metadata?: Array<{ label: string; value: string }>;
  rightContent?: React.ReactNode;
  onClick?: () => void;
}

export default function ListItemCard({
  href,
  title,
  subtitle,
  description,
  status,
  metadata,
  rightContent,
  onClick,
}: ListItemCardProps) {
  const content = (
    <div
      className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition-all ${
        href || onClick ? 'cursor-pointer' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {title}
            </h3>
            {status && <StatusBadge status={status} size="sm" />}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              {subtitle}
            </p>
          )}
          {description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-1">
              {description}
            </p>
          )}
          {metadata && metadata.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2">
              {metadata.map((item, index) => (
                <div key={index} className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {item.label}:
                  </span>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {rightContent || (
          <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px] shrink-0">
            chevron_right
          </span>
        )}
      </div>
    </div>
  );

  if (href && !onClick) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
