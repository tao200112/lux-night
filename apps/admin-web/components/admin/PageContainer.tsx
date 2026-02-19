/**
 * Admin PageContainer
 * 统一 Admin 页面布局：max-w-6xl mx-auto px-4 md:px-6
 * fullBleed 时无 max-w 限制，适合 Events / Change-requests 等全屏页面
 */

interface PageContainerProps {
  children: React.ReactNode;
  fullBleed?: boolean;
  /** 额外 className，用于覆盖或补充 */
  className?: string;
}

export default function PageContainer({
  children,
  fullBleed = false,
  className = '',
}: PageContainerProps) {
  return (
    <div
      className={
        fullBleed
          ? `min-h-[calc(100vh-theme(spacing.20))] flex flex-col px-4 md:px-6 ${className}`.trim()
          : `min-h-[calc(100vh-theme(spacing.20))] flex flex-col max-w-6xl mx-auto px-4 md:px-6 ${className}`.trim()
      }
    >
      {children}
    </div>
  );
}
