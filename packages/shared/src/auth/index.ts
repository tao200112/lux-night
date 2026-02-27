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

export { requireUser, isRequireUserOk } from './requireUser';
export type { RequireUserOk, RequireUserResult } from './requireUser';
export { requireAdmin, isRequireAdminOk } from './requireAdmin';
export type { RequireAdminOk, RequireAdminResult, CreateAdminClient } from './requireAdmin';
export { requireMerchantRole, isRequireMerchantRoleOk } from './requireMerchantRole';
export type { RequireMerchantRoleOk, RequireMerchantRoleResult } from './requireMerchantRole';
export { requireVenueAccess, isRequireVenueAccessOk } from './requireVenueAccess';
export type { RequireVenueAccessOk, RequireVenueAccessResult } from './requireVenueAccess';
