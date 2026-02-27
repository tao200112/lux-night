/**
 * POST /api/profile/ensure
 * 确保用户 profile 存在（使用 service role 绕过 RLS）
 * 如果不存在则创建，如果存在则返回现有 profile
 */

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { rateLimitOrResponse, rateLimitPolicies } from '@lux-night/security';
import { NextRequest, NextResponse } from 'next/server';

// 使用 service role key 创建 admin client（绕过 RLS）
const getAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};

export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;
    // 首先验证用户已登录（使用普通 client）
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 使用 admin client 检查 profile 是否存在
    const adminClient = getAdminClient();
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({ profile: existingProfile });
    }

    // 如果不存在，创建新 profile
    const { data: newProfile, error: insertError } = await adminClient
      .from('profiles')
      .insert({
        id: user.id,
        display_name: user.email?.split('@')[0] || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[PROFILE ENSURE API] Error creating profile:', insertError);
      return NextResponse.json(
        { error: 'Failed to create profile', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: newProfile });
  } catch (error: any) {
    console.error('[PROFILE ENSURE API] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
