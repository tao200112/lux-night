import type { SupabaseClient } from '@supabase/supabase-js';

const RPC_LOG_PREFIX = '[RPC]';

export type RpcContext = {
  userId?: string;
  route?: string;
  rpc: string;
};

export async function callRpc<T = unknown>(
  supabase: SupabaseClient,
  rpcName: string,
  params: Record<string, unknown>,
  context?: Partial<RpcContext>
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  const ctx: RpcContext = { rpc: rpcName, ...context };
  try {
    const { data, error } = await supabase.rpc(rpcName, params);
    if (error) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.warn(`${RPC_LOG_PREFIX} ${rpcName} error`, { ...ctx, error: error.message, code: error.code });
      }
      return { data: null, error: { message: error.message, code: error.code } };
    }
    return { data: data as T, error: null };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${RPC_LOG_PREFIX} ${rpcName} exception`, { ...ctx, err: message });
    return { data: null, error: { message } };
  }
}

export function requireRpcOk<T>(result: { data: T | null; error: { message: string } | null }): result is { data: T; error: null } {
  return result.error === null && result.data !== null;
}
