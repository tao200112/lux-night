/**
 * GET /api/admin/approvals
 * Admin Approvals List API
 * 返回审批列表（支持 status 筛选）
 */

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
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
    
    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'pending';
    const query = searchParams.get('query') || '';
    
    // 构建查询（修复：分两步查询，避免 relationship 不存在的错误）
    // Step 1: 查询 requests 和相关表
    let requestQuery = supabase
      .from('requests')
      .select(`
        id,
        type,
        status,
        payload_before,
        payload_after,
        admin_note,
        requested_by,
        created_at,
        decided_at,
        merchant_id,
        venue_id,
        merchants!inner(
          id,
          name
        ),
        venues(
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });
    
    // 状态筛选
    if (status !== 'all') {
      requestQuery = requestQuery.eq('status', status);
    }
    
    // 搜索筛选（按商家名称）
    if (query) {
      requestQuery = requestQuery.ilike('merchants.name', `%${query}%`);
    }
    
    const { data: requests, error: requestsError } = await requestQuery;
    
    if (requestsError) {
      console.error('[ADMIN APPROVALS API] Error:', requestsError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: requestsError.message },
        { status: 500 }
      );
    }
    
    // Step 2: 批量查询 profiles（通过 requested_by）
    const userIds = [...new Set((requests || []).map((req: any) => req.requested_by).filter(Boolean))];
    let profilesMap: Record<string, any> = {};
    
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);
      
      if (!profilesError && profiles) {
        profiles.forEach((profile: any) => {
          profilesMap[profile.id] = profile;
        });
      }
    }
    
    // 格式化响应
    const formattedRequests = (requests || []).map((req: any) => {
      const merchantData = (() => {
        if (!req.merchants) return null;
        const merchant = Array.isArray(req.merchants) ? req.merchants[0] : req.merchants;
        return merchant ? {
          id: merchant.id,
          name: merchant.name,
        } : null;
      })();
      
      const venueData = (() => {
        if (!req.venues) return null;
        const venue = Array.isArray(req.venues) ? req.venues[0] : req.venues;
        return venue ? {
          id: venue.id,
          name: venue.name,
        } : null;
      })();
      
      return {
        id: req.id,
        type: req.type,
        status: req.status,
        merchant: merchantData,
        venue: venueData,
        requestedBy: req.requested_by && profilesMap[req.requested_by] ? {
          id: profilesMap[req.requested_by].id,
          name: profilesMap[req.requested_by].display_name || 'Unknown',
          avatar: profilesMap[req.requested_by].avatar_url,
        } : null,
        payloadBefore: req.payload_before,
        payloadAfter: req.payload_after,
        note: req.admin_note,
        createdAt: req.created_at,
        decidedAt: req.decided_at,
      };
    });
    
    // 获取各状态数量
    const { count: pendingCount } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    const { count: approvedCount } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');
    
    const { count: rejectedCount } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected');
    
    return NextResponse.json({
      success: true,
      data: {
        requests: formattedRequests,
        counts: {
          pending: pendingCount || 0,
          approved: approvedCount || 0,
          rejected: rejectedCount || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('[ADMIN APPROVALS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
