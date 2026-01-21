/**
 * Safe Redirect Utilities
 * 防止开放重定向漏洞的工具函数
 * 
 * 用于在服务端和客户端都能安全地处理重定向路径
 */

/**
 * 规范化相对路径，确保安全
 * 
 * 安全规则：
 * - 只允许相对路径（以 "/" 开头）
 * - 禁止包含协议头（http://、https://）
 * - 禁止包含 // 开头（协议相对 URL）
 * - 如果不符合规则，返回 fallback
 * 
 * @param path - 待验证的路径
 * @param fallback - 不符合规则时的回退路径（默认 "/"）
 * @returns 安全的相对路径
 */
export function normalizeRelativePath(path: string | null | undefined, fallback: string = '/'): string {
  // 空值检查
  if (!path || typeof path !== 'string') {
    return fallback;
  }

  // 去除首尾空白
  const trimmed = path.trim();

  if (!trimmed) {
    return fallback;
  }

  // 禁止协议头
  if (trimmed.includes('://')) {
    console.warn('[safeRedirect] Protocol detected in path, using fallback:', trimmed);
    return fallback;
  }

  // 禁止协议相对 URL（//example.com）
  if (trimmed.startsWith('//')) {
    console.warn('[safeRedirect] Protocol-relative URL detected, using fallback:', trimmed);
    return fallback;
  }

  // 必须以 "/" 开头
  if (!trimmed.startsWith('/')) {
    console.warn('[safeRedirect] Path must start with "/", using fallback:', trimmed);
    return fallback;
  }

  return trimmed;
}

/**
 * 从 URL 查询参数中提取安全的重定向路径
 * 
 * 常用于处理 ?redirect=/some/path 或 ?next=/some/path
 * 
 * @param searchParams - URL 查询参数对象或字符串
 * @param paramName - 参数名称（默认 "redirect"）
 * @param fallback - 回退路径（默认 "/"）
 * @returns 安全的相对路径
 */
export function extractSafeRedirect(
  searchParams: URLSearchParams | string,
  paramName: string = 'redirect',
  fallback: string = '/'
): string {
  let params: URLSearchParams;

  if (typeof searchParams === 'string') {
    params = new URLSearchParams(searchParams);
  } else {
    params = searchParams;
  }

  const redirectPath = params.get(paramName);
  return normalizeRelativePath(redirectPath, fallback);
}

/**
 * 验证路径是否为安全的相对路径
 * 
 * @param path - 待验证的路径
 * @returns true 如果路径安全
 */
export function isSafeRelativePath(path: string | null | undefined): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  const trimmed = path.trim();

  // 必须非空
  if (!trimmed) {
    return false;
  }

  // 不能包含协议
  if (trimmed.includes('://') || trimmed.startsWith('//')) {
    return false;
  }

  // 必须以 "/" 开头
  if (!trimmed.startsWith('/')) {
    return false;
  }

  return true;
}
