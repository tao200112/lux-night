'use server';
import { createClient } from '@/lib/supabase/server';
import { callRpc as callRpcBase, requireRpcOk } from '@lux-night/shared/server/rpc';
import type { RpcContext } from '@lux-night/shared/server/rpc';

export { requireRpcOk };
export type { RpcContext };

export async function callRpc<T = unknown>(
  rpcName: string,
  params: Record<string, unknown>,
  context?: Partial<RpcContext>
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  const supabase = await createClient();
  return callRpcBase(supabase, rpcName, params, context);
}
