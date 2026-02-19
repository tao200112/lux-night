/**
 * Workspace Selection Page
 * Workspace 选择页面
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface WorkspaceData {
  merchantId: string;
  merchantName: string;
  role: string;
  isActive: boolean;
  createdAt?: string; // 用于排序
  venues: Array<{
    venueId: string;
    venueName: string;
    isAssigned: boolean;
  }>;
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMembership, setHasMembership] = useState<boolean>(false);
  const [membershipError, setMembershipError] = useState<{ message: string; code?: string } | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<{
    merchantId: string;
    venueId?: string;
  } | null>(null);
  const [activeMerchantId, setActiveMerchantId] = useState<string | null>(null);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      setLoading(true);
      setError(null);
      setMembershipError(null);

      const res = await fetch('/api/me');
      const data = await res.json();

      // DEBUG: 开发环境打印原始响应
      if (process.env.NODE_ENV === 'development') {
        console.log('[WORKSPACES PAGE] API /me response:', {
          ok: res.ok,
          status: res.status,
          hasMembership: data.hasMembership,
          membershipsCount: data.memberships?.length || 0,
          membershipError: data.membershipError,
          workspaces: data.memberships,
        });
      }

      if (!res.ok) {
        const errorMsg = data.message || data.error || 'Failed to load workspaces';
        setError(errorMsg);
        setHasMembership(false);
        return;
      }

      // 检查是否有 membership（关键判断）
      const hasMembershipValue = data.hasMembership === true;
      setHasMembership(hasMembershipValue);

      // 如果有 membership 错误，记录但不阻止显示
      if (data.membershipError) {
        setMembershipError({
          message: data.membershipError.message || 'Failed to verify membership',
          code: data.membershipError.code,
        });
        console.error('[WORKSPACES PAGE] Membership error:', data.membershipError);
      }

      // 设置 workspaces 数据并排序
      const workspacesData = (data.memberships || []).map((ws: any) => ({
        ...ws,
        // 确保 merchantName 不为空或 "Unknown"
        merchantName: ws.merchantName && ws.merchantName !== 'Unknown' 
          ? ws.merchantName 
          : `Merchant ${ws.merchantId.substring(0, 8)}`,
      }));
      
      // 排序：当前 active workspace 放第一，最近加入（created_at 最近的）放第二
      const defaultMerchantId = data.defaultWorkspace?.merchantId;
      const sortedWorkspaces = [...workspacesData].sort((a, b) => {
        // 1. Active workspace 优先
        if (a.merchantId === defaultMerchantId && b.merchantId !== defaultMerchantId) return -1;
        if (b.merchantId === defaultMerchantId && a.merchantId !== defaultMerchantId) return 1;
        
        // 2. 最近加入的优先（created_at 降序）
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (a.createdAt) return -1;
        if (b.createdAt) return 1;
        
        return 0;
      });
      
      setWorkspaces(sortedWorkspaces);

      // 检查是否有 merchant_id 为 null 的 membership
      const invalidMemberships = sortedWorkspaces.filter((ws: any) => !ws.merchantId);
      if (invalidMemberships.length > 0) {
        console.warn('[WORKSPACES PAGE] Found memberships with null merchant_id:', invalidMemberships);
      }
      
      // 保存 active merchant ID
      if (data.defaultWorkspace) {
        setActiveMerchantId(data.defaultWorkspace.merchantId);
        setSelectedWorkspace({
          merchantId: data.defaultWorkspace.merchantId,
          venueId: data.defaultWorkspace.venueId,
        });
      } else if (sortedWorkspaces.length === 1) {
        // 如果只有一个workspace，自动选择
        const ws = sortedWorkspaces[0];
        setSelectedWorkspace({
          merchantId: ws.merchantId,
          venueId: ws.venues?.[0]?.venueId,
        });
      } else if (sortedWorkspaces.length > 0) {
        // 如果有多个，默认选择第一个（已排序，第一个是 active 或最近加入的）
        const ws = sortedWorkspaces[0];
        setSelectedWorkspace({
          merchantId: ws.merchantId,
          venueId: ws.venues?.[0]?.venueId,
        });
      }
    } catch (err: any) {
      console.error('[WORKSPACES PAGE] Load workspaces error:', err);
      setError(err.message || 'Failed to load workspaces');
      setHasMembership(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorkspace = async () => {
    if (!selectedWorkspace) return;

    try {
      setError(null); // 清除之前的错误

      const res = await fetch('/api/workspace/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          merchantId: selectedWorkspace.merchantId,
          venueId: selectedWorkspace.venueId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || `Failed to select workspace (${res.status})`;
        throw new Error(errorMsg);
      }

      const data = await res.json();

      // DEBUG: 开发环境打印成功日志
      if (process.env.NODE_ENV === 'development') {
        console.log('[WORKSPACES PAGE] Workspace selected:', data);
      }

      // 根据角色跳转（统一使用小写）
      const workspace = workspaces.find(
        (w) => w.merchantId === selectedWorkspace.merchantId
      );
      
      const role = workspace?.role?.toLowerCase() || 'staff';
      if (role === 'staff') {
        router.push('/scan');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      console.error('[WORKSPACES PAGE] Select workspace error:', err);
      setError(err.message || 'Failed to select workspace');
      // 不自动重试，让用户手动点击重试
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // 错误状态：显示错误信息并提供重试按钮
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-alert-red text-center mb-4">{error}</p>
        <button
          onClick={loadWorkspaces}
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  // 关键修复：基于 hasMembership 判断，而不是 workspaces.length
  // 如果 hasMembership=true 但 workspaces=[]，说明加载失败，不应提示输入邀请码
  if (hasMembership && workspaces.length === 0) {
    // 检查是否有 merchant_id 为 null 的情况
    const hasInvalidMembership = membershipError?.code === 'PGRST' || membershipError?.message?.includes('null');
    
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-alert-red text-center mb-2">
          {hasInvalidMembership 
            ? 'Membership record invalid (merchant_id missing). Please contact administrator.'
            : 'You have membership but failed to load workspace details.'}
        </p>
        {process.env.NODE_ENV === 'development' && membershipError && (
          <p className="text-gray-500 text-sm text-center mb-4">
            Error: {membershipError.message} {membershipError.code ? `(${membershipError.code})` : ''}
          </p>
        )}
        <button
          onClick={loadWorkspaces}
          className="px-4 py-2 bg-primary text-white rounded-lg mb-2"
        >
          Retry / Refresh
        </button>
        {hasInvalidMembership && (
          <p className="text-gray-400 text-sm text-center mt-4">
            Do not enter invite code again. Please contact support.
          </p>
        )}
      </div>
    );
  }

  // 如果没有 membership，才提示输入邀请码
  if (!hasMembership && workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-gray-400 text-center mb-4">
          No workspaces found. Please enter an invite code.
        </p>
        <button
          onClick={() => router.push('/invite')}
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          Enter Invite Code
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[430px] lg:max-w-6xl mx-auto min-h-screen bg-background-dark text-white p-8">
      <h1 className="text-2xl font-bold mb-8">Select Workspace</h1>

      <div className="space-y-4 mb-8">
        {workspaces.map((ws) => (
          <div
            key={ws.merchantId}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedWorkspace?.merchantId === ws.merchantId
                ? 'border-primary bg-primary/10'
                : 'border-gray-700 bg-surface-dark'
            }`}
            onClick={() =>
              setSelectedWorkspace({
                merchantId: ws.merchantId,
                venueId: ws.venues[0]?.venueId,
              })
            }
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">{ws.merchantName}</div>
              {activeMerchantId === ws.merchantId && (
                <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded-full">
                  Active
                </span>
              )}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              Role: {ws.role}
            </div>
            {ws.venues.length > 0 && (
              <div className="text-sm text-gray-500 mt-1">
                Venues: {ws.venues.map((v) => v.venueName).join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSelectWorkspace}
        disabled={!selectedWorkspace}
        className="w-full h-14 bg-primary text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
      >
        Continue
      </button>
    </div>
  );
}
