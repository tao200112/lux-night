/**
 * Admin Button
 * Admin 端口按钮组件（Primary/Secondary/Danger）
 */

'use client';

interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  icon?: string;
  fullWidth?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export default function AdminButton({
  variant = 'primary',
  icon,
  fullWidth = false,
  loading = false,
  disabled,
  size = 'md',
  children,
  className = '',
  ...props
}: AdminButtonProps) {
  const baseClasses = 'flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  
  const sizeClasses = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };
  
  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm shadow-blue-900/20',
    secondary: 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600',
    danger: 'bg-danger text-white hover:bg-red-700',
    outline: 'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
  };
  
  const widthClass = fullWidth ? 'w-full' : '';
  
  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined text-[18px] animate-spin">
          sync
        </span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
