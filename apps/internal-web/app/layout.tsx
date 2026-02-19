/**
 * Internal Layout
 * 内部端布局组件（包含路由保护）
 */

import React from 'react';
import { MerchantProvider } from '../contexts/MerchantContext';
import MerchantShell from '../components/MerchantShell';
import './globals.css';

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background-dark text-white font-sans antialiased">
        <MerchantProvider>
          <div className="relative w-full min-h-screen bg-background-dark text-white">
            <MerchantShell>{children}</MerchantShell>
          </div>
        </MerchantProvider>
      </body>
    </html>
  );
}
