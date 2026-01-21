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
  const [selectedWorkspace, setSelectedWorkspace] = useState<{
    merchantId: string;
    venueId?: string;
  } | null>(null);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Failed to load workspaces');
        return;
      }

      setWorkspaces(data.memberships || []);
      
      // 如果有默认workspace，自动选择
      if (data.defaultWorkspace) {
        setSelectedWorkspace({
          merchantId: data.defaultWorkspace.merchantId,
          venueId: data.defaultWorkspace.venueId,
        });
      } else if (data.memberships?.length === 1) {
        // 如果只有一个workspace，自动选择
        const ws = data.memberships[0];
        setSelectedWorkspace({
          merchantId: ws.merchantId,
          venueId: ws.venues[0]?.venueId,
        });
      }
    } catch (err: any) {
      setError('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorkspace = async () => {
    if (!selectedWorkspace) return;

    try {
      const res = await fetch('/api/workspace/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: selectedWorkspace.merchantId,
          venueId: selectedWorkspace.venueId,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to select workspace');
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
      setError('Failed to select workspace');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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

  if (workspaces.length === 0) {
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
    <div className="relative w-full max-w-[430px] mx-auto min-h-screen bg-background-dark text-white p-8">
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
            <div className="font-semibold">{ws.merchantName}</div>
            <div className="text-sm text-gray-400 mt-1">Role: {ws.role}</div>
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
