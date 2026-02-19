/**
 * Nav visibility rules: denylist (default show, hide only explicit routes)
 * - pathname null: return true (avoid flash during hydration)
 * - Hide only: /login, /auth/*, /invite (exact or prefix)
 */

const HIDE_NAV_PREFIXES = ['/login', '/auth', '/invite'];

export function shouldShowNav(pathname: string | null): boolean {
  if (pathname == null) return true;
  if (pathname === '') return true;
  return !HIDE_NAV_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}
