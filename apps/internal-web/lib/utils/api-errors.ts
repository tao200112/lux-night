/**
 * API Error Handling Utilities
 * 统一处理 API 错误码与路由跳转
 */

import { useRouter } from 'next/navigation';

export type APIErrorCode =
  | 'UNAUTHORIZED'
  | 'NO_ACCESS'
  | 'NO_WORKSPACE'
  | 'NEED_SELECT_VENUE'
  | 'WRONG_VENUE'
  | 'DUPLICATE_REDEEM'
  | 'TICKET_NOT_FOUND'
  | 'OFFLINE'
  | 'INVALID_REQUEST'
  | 'FETCH_FAILED'
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'INTERNAL_ERROR';

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIErrorCode;
  message?: string;
  code?: string;
}

/**
 * 处理 API 响应错误并跳转到对应页面
 */
export function handleAPIError(response: Response, data: APIResponse, router: ReturnType<typeof useRouter>) {
  const errorCode = data.error || data.code;

  switch (errorCode) {
    case 'UNAUTHORIZED':
      router.push('/login');
      break;
    case 'NO_ACCESS':
      router.push('/no-access');
      break;
    case 'NO_WORKSPACE':
    case 'NEED_SELECT_VENUE':
      router.push('/workspaces');
      break;
    case 'WRONG_VENUE':
      router.push('/scan/wrong-venue');
      break;
    case 'DUPLICATE_REDEEM':
      router.push('/scan/duplicate');
      break;
    case 'OFFLINE':
      router.push('/scan/offline');
      break;
    default:
      // 其他错误跳转到通用错误页
      router.push('/error');
  }
}

/**
 * 统一的 fetch 包装器，自动处理错误码
 */
export async function fetchAPI<T = any>(
  url: string,
  options: RequestInit = {},
  router?: ReturnType<typeof useRouter>
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data: APIResponse<T> = await res.json();

  if (!res.ok || !data.success) {
    if (router) {
      handleAPIError(res, data, router);
    }
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }

  return data.data as T;
}
