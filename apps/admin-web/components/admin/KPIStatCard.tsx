/**
 * KPI Stat Card
 * KPI 统计卡片组件（用于 Dashboard）
 */

'use client';

interface KPIStatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: number | null; // number = 百分比，null = 显示 "—"
  onClick?: () => void;
}

export default function KPIStatCard({
  label,
  value,
  subtitle,
  icon,
  trend,
  onClick,
}: KPIStatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-card ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[24px]">
            {icon}
          </span>
        )}
      </div>
      {trend !== undefined && (
        <div className={`mt-1 flex items-center text-xs font-medium ${
          trend === null 
            ? 'text-slate-400 bg-slate-100 dark:bg-slate-700 w-fit px-1.5 py-0.5 rounded'
            : trend >= 0
            ? 'text-success bg-success/10 w-fit px-1.5 py-0.5 rounded'
            : 'text-danger bg-danger/10 w-fit px-1.5 py-0.5 rounded'
        }`}>
          {trend === null ? (
            <span>—</span>
          ) : (
            <>
              <span className="material-symbols-outlined text-[14px] mr-0.5">
                {trend >= 0 ? 'trending_up' : 'trending_down'}
              </span>
              <span>{Math.abs(trend)}%</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
