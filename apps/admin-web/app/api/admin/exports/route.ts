/**
 * GET /api/admin/exports
 * POST /api/admin/exports
 * Admin Exports API
 * 数据导出任务管理
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
    
    // 获取导出任务列表（从 export_tasks 表）
    const { data: tasks, error: tasksError } = await supabase
      .from('export_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (tasksError) {
      console.error('[ADMIN EXPORTS API] Error:', tasksError);
      return NextResponse.json(
        { success: false, code: 'QUERY_ERROR', message: tasksError.message },
        { status: 500 }
      );
    }
    
    // 格式化响应
    const formattedTasks = (tasks || []).map((task: any) => ({
      id: task.id,
      dataType: task.data_type,
      fileName: task.file_name,
      status: task.status, // ready, processing, failed
      fileUrl: task.file_url,
      fileSizeBytes: task.file_size_bytes,
      fileSizeFormatted: task.file_size_bytes ? `${(task.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : null,
      regionId: task.region_id,
      merchantId: task.merchant_id,
      filters: task.filters || {},
      createdAt: task.created_at,
      completedAt: task.completed_at,
      errorMessage: task.error_message,
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        tasks: formattedTasks,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN EXPORTS API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/exports
 * Create new export task
 */
export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const { dataType, region, merchant, format, dateRange, filters } = body;
    
    if (!dataType) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: 'Data type is required' },
        { status: 400 }
      );
    }
    
    // 生成文件名
    const timestamp = new Date().toISOString().split('T')[0];
    const regionName = region || 'Global';
    const fileName = `${dataType}_${regionName}_${timestamp}.${format || 'csv'}`;
    
    // 创建导出任务
    const { data: task, error: insertError } = await supabase
      .from('export_tasks')
      .insert({
        data_type: dataType,
        file_name: fileName,
        status: 'processing',
        region_id: region || null,
        merchant_id: merchant || null,
        format: format || 'csv',
        filters: filters || {},
        created_by: user.id,
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('[ADMIN EXPORTS CREATE API] Error:', insertError);
      return NextResponse.json(
        { success: false, code: 'INSERT_ERROR', message: insertError.message },
        { status: 500 }
      );
    }
    
    // TODO: 异步处理导出任务（使用 background job 或 queue）
    // 这里暂时返回任务，实际导出应该异步进行
    
    // 写 audit log
    try {
      await supabase.rpc('log_audit', {
        p_action: 'create_export',
        p_entity_type: 'export_task',
        p_entity_id: task.id,
        p_before_state: null,
        p_after_state: { data_type: dataType, file_name: fileName },
        p_metadata: { region_id: region, merchant_id: merchant },
      });
    } catch (auditError) {
      console.error('[ADMIN EXPORTS CREATE API] Audit log error:', auditError);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        fileName: task.file_name,
        status: task.status,
        message: 'Export task created successfully',
      },
    });
  } catch (error: any) {
    console.error('[ADMIN EXPORTS CREATE API] Error:', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
