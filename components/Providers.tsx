/**
 * Client-side Providers
 * 将所有 Client Components 包装在这里，避免在 Server Component (layout.tsx) 中直接使用
 */

'use client';

import { AuthProvider } from '../contexts/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
