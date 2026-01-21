'use client';

import { loadStripe, Stripe } from '@stripe/stripe-js';

/**
 * 获取 Stripe 客户端实例
 * 如果未配置，返回 null（而不是抛出错误）
 */
export const getStripe = async (): Promise<Stripe | null> => {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return null;
  }
  return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
};

/**
 * 检查 Stripe 是否已配置（客户端）
 */
export function isStripeConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
}
