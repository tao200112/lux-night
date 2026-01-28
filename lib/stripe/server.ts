import Stripe from 'stripe';

/**
 * Stripe Server Client
 * 如果未配置 STRIPE_SECRET_KEY，返回 null（而不是抛出错误）
 * 这样应用可以在未配置 Stripe 时正常运行
 */
export const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  : null;

/**
 * 检查 Stripe 是否已配置
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
}
