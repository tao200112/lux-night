/**
 * Merchant Context
 * 提供 workspace/venue/role 上下文，所有数据来自真实 API/数据库
 */

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

export interface Workspace {
  merchantId: string;
  merchantName: string;
  venueId?: string;
  venueName?: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'admin';
}

export interface Membership {
  merchantId: string;
  merchantName: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'admin';
  isActive: boolean;
  venues: Array<{
    venueId: string;
    venueName: string;
    isAssigned: boolean;
  }>;
}

export interface MerchantContextType {
  // 状态
  user: { id: string; email: string } | null;
  memberships: Membership[];
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;

  // 操作
  refresh: () => Promise<void>;
  switchWorkspace: (merchantId: string, venueId?: string) => Promise<void>;
  clearError: () => void;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectWorkspaceAbortControllerRef = useRef<AbortController | null>(null);
  const hasAutoSelectedRef = useRef<boolean>(false);

  // 从 API 加载用户信息和 workspace
  const loadMerchantData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/me', {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 401) {
          // 未登录，跳转到登录页
          router.push('/login');
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data.user || !data.memberships) {
        // 无 membership，跳转到 invite 页
        router.push('/invite');
        return;
      }

      setUser(data.user);
      setMemberships(data.memberships || []);

      // 设置 workspace（从 defaultWorkspace 或第一个 membership）
      if (data.defaultWorkspace) {
        setWorkspace(data.defaultWorkspace);
      } else if (data.memberships && data.memberships.length > 0) {
        const first = data.memberships[0];
        const firstVenue = first.venues?.[0];
        const defaultWs: Workspace = {
          merchantId: first.merchantId,
          merchantName: first.merchantName,
          venueId: firstVenue?.venueId,
          venueName: firstVenue?.venueName,
          role: first.role,
        };
        setWorkspace(defaultWs);

        // 自动设置默认 workspace（后台操作，不阻塞，只执行一次）
        // 使用 ref 防止重复调用
        if (!hasAutoSelectedRef.current) {
          hasAutoSelectedRef.current = true;
          
          // 取消之前的请求（如果有）
          if (selectWorkspaceAbortControllerRef.current) {
            selectWorkspaceAbortControllerRef.current.abort();
          }
          
          const controller = new AbortController();
          selectWorkspaceAbortControllerRef.current = controller;
          
          fetch('/api/workspace/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: controller.signal,
            body: JSON.stringify({
              merchantId: defaultWs.merchantId, // 统一使用 merchantId 格式
              venueId: defaultWs.venueId,
            }),
          })
            .then(res => {
              if (!res.ok) {
                console.warn('[MerchantContext] Auto-select workspace failed:', res.status);
              } else {
                console.log('[MerchantContext] Auto-select workspace success');
              }
            })
            .catch(err => {
              // 忽略 AbortError（正常取消）
              if (err.name !== 'AbortError') {
                console.error('[MerchantContext] Auto-select workspace error:', err);
              }
            })
            .finally(() => {
              // 清理 ref
              if (selectWorkspaceAbortControllerRef.current === controller) {
                selectWorkspaceAbortControllerRef.current = null;
              }
            });
        }
      } else {
        // 无 workspace，跳转到 select-workspace
        router.push('/workspaces');
      }
    } catch (err: any) {
      console.error('Error loading merchant data:', err);
      setError(err.message || 'Failed to load merchant data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // 切换 workspace
  const switchWorkspace = useCallback(async (merchantId: string, venueId?: string) => {
    try {
      setError(null);

      const res = await fetch('/api/workspace/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          merchantId: merchantId, // 统一使用 merchantId 格式
          venueId: venueId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to switch workspace (${res.status})`);
      }

      const data = await res.json();

      // 更新 workspace
      const membership = memberships.find(m => m.merchantId === merchantId);
      if (membership) {
        const venue = venueId
          ? membership.venues.find(v => v.venueId === venueId)
          : membership.venues[0];

        setWorkspace({
          merchantId: membership.merchantId,
          merchantName: membership.merchantName,
          venueId: venue?.venueId,
          venueName: venue?.venueName,
          role: membership.role,
        });
      }

      // 重新加载数据以确保同步
      await loadMerchantData();
    } catch (err: any) {
      console.error('[MerchantContext] Error switching workspace:', err);
      setError(err.message || 'Failed to switch workspace');
      throw err; // 重新抛出错误，让调用方知道失败
    }
  }, [memberships, loadMerchantData]);

  useEffect(() => {
    loadMerchantData();
    
    // 清理函数：组件卸载时取消正在进行的请求
    return () => {
      if (selectWorkspaceAbortControllerRef.current) {
        selectWorkspaceAbortControllerRef.current.abort();
        selectWorkspaceAbortControllerRef.current = null;
      }
      hasAutoSelectedRef.current = false;
    };
  }, [loadMerchantData]);

  return (
    <MerchantContext.Provider
      value={{
        user,
        memberships,
        workspace,
        loading,
        error,
        refresh: loadMerchantData,
        switchWorkspace,
        clearError: () => setError(null),
      }}
    >
      {children}
    </MerchantContext.Provider>
  );
}

export function useMerchantContext() {
  const context = useContext(MerchantContext);
  if (!context) {
    throw new Error('useMerchantContext must be used within MerchantProvider');
  }
  return context;
}
