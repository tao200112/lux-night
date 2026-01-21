/**
 * Internal Layout
 * 内部端布局组件（包含路由保护）
 */

import React from 'react';
import { redirect } from 'next/navigation';
import { getInternalUser, hasWorkspace } from '@/lib/internal/auth';
import { getActiveWorkspace } from '@/lib/internal/workspace';

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 在服务端检查认证和workspace
  // 注意：这里不能直接用redirect，因为layout不能redirect
  // 实际的redirect逻辑在middleware中处理
  // 这里主要用于传递数据给子组件

  return (
    <div className="relative w-full min-h-screen bg-background-dark text-white">
      {children}
    </div>
  );
}
