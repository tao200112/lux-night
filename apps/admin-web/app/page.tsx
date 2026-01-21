/**
 * Admin Root Page
 * 根路径重定向到 dashboard（middleware 会处理认证，这里只是重定向）
 */

import { redirect } from 'next/navigation';

export default async function IndexPage() {
  // Middleware 已经处理了认证和权限检查
  // 如果到达这里，说明已经通过 middleware 验证
  redirect('/dashboard');
}
