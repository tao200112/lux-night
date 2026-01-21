/**
 * Internal Layout
 * 内部端布局组件（包含路由保护）
 */

import React from 'react';
import { MerchantProvider } from '../contexts/MerchantContext';
import './globals.css';

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
    <html lang="en" className="dark">
      <body className="bg-background-dark text-white font-sans antialiased">
        <MerchantProvider>
          <div className="relative w-full min-h-screen bg-background-dark text-white">
            {children}
          </div>
        </MerchantProvider>
      </body>
    </html>
  );
}
