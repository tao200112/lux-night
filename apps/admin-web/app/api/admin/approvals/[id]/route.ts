/**
 * GET /api/admin/approvals/[id]
 * Admin Approval Detail API
 * 返回审批详情（包含 Before/After 对比数据）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // 检查 Admin 权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Must be logged in' },
        { status: 401 }
      );
    }
    
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Must be admin' },
        { status: 403 }
      );
    }
    
    // 获取审批详情（修复：分两步查询，避免 relationship 不存在的错误）
    // Step 1: 查询 request 和相关表
    const { data: request, error: requestError } = await supabase
      .from('requests')
      .select(`
        id,
        type,
        status,
        payload_before,
        payload_after,
        admin_note,
        requested_by,
        decided_by,
        created_at,
        decided_at,
        merchant_id,
        venue_id,
        merchants(
          id,
          name,
          region_id
        ),
        venues(
          id,
          name
        ),
        events(
          id,
          title
        )
      `)
      .eq('id', id)
      .single();
    
    if (requestError || !request) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Request not found' },
        { status: 404 }
      );
    }
    
    // Step 2: 查询 profiles（requested_by 和 decided_by）
    const userIds = [request.requested_by, request.decided_by].filter(Boolean);
    let requestedByProfile: any = null;
    let decidedByProfile: any = null;
    
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, email')
        .in('id', userIds);
      
      if (!profilesError && profiles) {
        requestedByProfile = profiles.find(p => p.id === request.requested_by) || null;
        decidedByProfile = profiles.find(p => p.id === request.decided_by) || null;
      }
    }
    
    // 格式化响应
    return NextResponse.json({
      success: true,
      data: {
        id: request.id,
        type: request.type,
        status: request.status,
        merchant: request.merchants && Array.isArray(request.merchants) && request.merchants.length > 0 ? {
          id: request.merchants[0].id,
          name: request.merchants[0].name,
          regionId: request.merchants[0].region_id,
        } : null,
        venue: request.venues && (Array.isArray(request.venues) ? request.venues[0] : request.venues) ? {
          id: Array.isArray(request.venues) ? request.venues[0].id : request.venues.id,
          name: Array.isArray(request.venues) ? request.venues[0].name : request.venues.name,
        } : null,
        event: request.events && (Array.isArray(request.events) ? request.events[0] : request.events) ? {
          id: Array.isArray(request.events) ? request.events[0].id : request.events.id,
          title: Array.isArray(request.events) ? request.events[0].title : request.events.title,
        } : null,
        requestedBy: requestedByProfile ? {
          id: requestedByProfile.id,
          name: requestedByProfile.display_name || 'Unknown',
          email: requestedByProfile.email,
          avatar: requestedByProfile.avatar_url,
        } : null,
        decidedBy: decidedByProfile ? {
          id: decidedByProfile.id,
          name: decidedByProfile.display_name || 'Unknown',
          email: decidedByProfile.email,
        } : null,
        payloadBefore: request.payload_before,
        payloadAfter: request.payload_after,
        note: request.admin_note,
        createdAt: request.created_at,
        decidedAt: request.decided_at,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN APPROVAL DETAIL API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
