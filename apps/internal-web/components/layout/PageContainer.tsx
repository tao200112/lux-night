/**
 * PageContainer
 * 统一页面宽度：mobile 430px，desktop lg:6xl 2xl:7xl，移除内层 max-w-md/max-w-lg 锁死
 */

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div
      className={`w-full mx-auto px-4 md:px-6 max-w-[430px] lg:max-w-6xl 2xl:max-w-7xl ${className}`.trim()}
    >
      {children}
    </div>
  );
}
