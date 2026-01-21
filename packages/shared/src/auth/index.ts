/**
 * Shared Auth Utilities
 * 统一的认证相关工具函数，供所有应用使用
 */

export {
  isBrowser,
  setPostAuthRedirect,
  consumePostAuthRedirect,
  getOAuthRedirectTo,
  clearPostAuthRedirect,
} from './postAuthRedirect';

export {
  normalizeRelativePath,
  extractSafeRedirect,
  isSafeRelativePath,
} from './safeRedirect';
