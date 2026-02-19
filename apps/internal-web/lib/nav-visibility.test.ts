/**
 * Table-driven tests for shouldShowNav (denylist rules)
 * Run: npx tsx lib/nav-visibility.test.ts
 */

import { shouldShowNav } from './nav-visibility';

const cases: Array<{ pathname: string | null; expected: boolean }> = [
  { pathname: null, expected: true },
  { pathname: '', expected: true },
  { pathname: '/', expected: true },
  { pathname: '/dashboard', expected: true },
  { pathname: '/events', expected: true },
  { pathname: '/events/123', expected: true },
  { pathname: '/staff', expected: true },
  { pathname: '/settings', expected: true },
  { pathname: '/scan', expected: true },
  { pathname: '/scan/lookup', expected: true },
  { pathname: '/scan/offline', expected: true },
  { pathname: '/workspaces', expected: true },
  { pathname: '/requests', expected: true },
  { pathname: '/requests/new-event', expected: true },
  { pathname: '/invites/create', expected: true },
  { pathname: '/onboarding/select-venue', expected: true },
  { pathname: '/onboarding/invite/invalid', expected: true },
  { pathname: '/admin/event-change-requests', expected: true },
  { pathname: '/login', expected: false },
  { pathname: '/auth/callback', expected: false },
  { pathname: '/auth/error', expected: false },
  { pathname: '/auth/post-login', expected: false },
  { pathname: '/invite', expected: false },
  { pathname: '/invite/consume', expected: false },
  { pathname: '/join', expected: true },
  { pathname: '/error', expected: true },
  { pathname: '/no-access', expected: true },
];

function runTests(): boolean {
  let passed = 0;
  let failed = 0;
  for (const { pathname, expected } of cases) {
    const got = shouldShowNav(pathname);
    if (got === expected) {
      passed++;
    } else {
      failed++;
      console.error(`FAIL pathname=${JSON.stringify(pathname)}: expected ${expected}, got ${got}`);
    }
  }
  console.log(`nav-visibility: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

runTests();
