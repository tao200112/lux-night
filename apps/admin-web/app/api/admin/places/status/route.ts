/**
 * GET /api/admin/places/status
 * 返回 { configured: boolean }，用于未配置 key 时禁用 Place 相关提交并提示
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ configured: false }, { status: 401 });
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) return NextResponse.json({ configured: false }, { status: 403 });
    return NextResponse.json({ configured: !!process.env.GOOGLE_MAPS_API_KEY });
  } catch {
    return NextResponse.json({ configured: false }, { status: 500 });
  }
}
