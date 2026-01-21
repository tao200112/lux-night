/**
 * Post-Auth Redirect Management
 * 统一管理所有应用的登录后跳转逻辑
 * 
 * 使用 localStorage 存储登录前的目标路径，登录成功后读取并跳转
 * 所有路径必须是相对路径（以 "/" 开头），禁止外域跳转
 */

/**
 * 检查是否在浏览器环境
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * 生成 localStorage key
 * @param appName - 应用名称: "customer" | "internal" | "admin"
 */
function getStorageKey(appName: string): string {
  return `luxnight:${appName}:post_auth_redirect`;
}

/**
 * 存储登录后要跳转的路径
 * 
 * 安全规则：
 * - 只允许相对路径（以 "/" 开头）
 * - 禁止包含协议头（http://、https://）
 * - 如果不符合规则，存储为 "/"
 * 
 * @param appName - 应用名称
 * @param path - 目标路径（必须是相对路径）
 */
export function setPostAuthRedirect(appName: string, path: string): void {
  if (!isBrowser()) {
    console.warn('[postAuthRedirect] Cannot set redirect in server environment');
    return;
  }

  // 安全校验：只允许相对路径
  let safePath = path;

  // 检测协议头
  if (safePath.includes('://') || safePath.startsWith('//')) {
    console.warn('[postAuthRedirect] External URL detected, using "/" instead:', path);
    safePath = '/';
  }

  // 确保以 "/" 开头
  if (!safePath.startsWith('/')) {
    console.warn('[postAuthRedirect] Path must start with "/", using "/" instead:', path);
    safePath = '/';
  }

  try {
    localStorage.setItem(getStorageKey(appName), safePath);
  } catch (error) {
    console.error('[postAuthRedirect] Failed to set redirect:', error);
  }
}

/**
 * 读取并消费登录后的跳转路径
 * 
 * 读取后立即删除（一次性使用）
 * 如果没有存储的路径或路径不安全，返回 defaultPath
 * 
 * @param appName - 应用名称
 * @param defaultPath - 默认跳转路径（如果没有存储的路径）
 * @returns 安全的相对路径
 */
export function consumePostAuthRedirect(appName: string, defaultPath: string): string {
  if (!isBrowser()) {
    console.warn('[postAuthRedirect] Cannot consume redirect in server environment');
    return defaultPath;
  }

  const key = getStorageKey(appName);
  let storedPath: string | null = null;

  try {
    storedPath = localStorage.getItem(key);
    // 立即删除，避免重复使用
    localStorage.removeItem(key);
  } catch (error) {
    console.error('[postAuthRedirect] Failed to consume redirect:', error);
    return defaultPath;
  }

  // 如果没有存储的路径，使用默认值
  if (!storedPath) {
    return defaultPath;
  }

  // 安全校验：只允许相对路径
  if (storedPath.includes('://') || storedPath.startsWith('//')) {
    console.warn('[postAuthRedirect] Stored path contains protocol, using default:', storedPath);
    return defaultPath;
  }

  if (!storedPath.startsWith('/')) {
    console.warn('[postAuthRedirect] Stored path does not start with "/", using default:', storedPath);
    return defaultPath;
  }

  return storedPath;
}

/**
 * 生成 OAuth 回调 URL
 * 
 * 始终使用当前浏览器的 origin，不依赖环境变量
 * 确保：在哪个应用登录，就回到哪个应用的 /auth/callback
 * 
 * @param origin - window.location.origin
 * @returns 完整的回调 URL
 */
export function getOAuthRedirectTo(origin: string): string {
  if (!origin) {
    console.error('[postAuthRedirect] origin is required');
    return '/auth/callback';
  }

  // 确保 origin 不包含尾部斜杠
  const cleanOrigin = origin.replace(/\/$/, '');
  
  return `${cleanOrigin}/auth/callback`;
}

/**
 * 清除存储的跳转路径（用于登出或重置）
 * 
 * @param appName - 应用名称
 */
export function clearPostAuthRedirect(appName: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.removeItem(getStorageKey(appName));
  } catch (error) {
    console.error('[postAuthRedirect] Failed to clear redirect:', error);
  }
}
