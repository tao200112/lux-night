/**
 * POST /api/merchant/upload-poster
 * 上传活动海报图片到 Supabase Storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// 使用 service role key 创建 admin client（绕过 RLS）
const getAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  
  return createAdminClient(
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
    await requireInternalAuth();

    // 获取当前workspace
    const workspace = await getActiveWorkspace();
    if (!workspace || !workspace.merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_WORKSPACE',
            message: 'No active workspace or merchant_id missing',
          },
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const eventId = formData.get('event_id') as string;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'File is required',
          },
        },
        { status: 400 }
      );
    }

    if (!eventId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'event_id is required',
          },
        },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'Server configuration error',
          },
        },
        { status: 500 }
      );
    }

    // 验证 event 属于当前 merchant
    const { data: event, error: eventError } = await adminClient
      .from('events')
      .select('id, merchant_id')
      .eq('id', eventId)
      .eq('merchant_id', workspace.merchantId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Event not found or does not belong to your merchant',
          },
        },
        { status: 404 }
      );
    }

    // 生成文件路径：merchant_id/events/event_id/{uuid}.{ext}
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${workspace.merchantId}/events/${eventId}/${fileName}`;

    // 转换 File 为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到 Supabase Storage (bucket: event-posters 或 posters)
    const bucketName = 'event-posters'; // 如果不存在，使用 'posters'
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    // 如果 event-posters bucket 不存在，尝试使用 posters
    if (uploadError && uploadError.message?.includes('Bucket not found')) {
      const { data: fallbackData, error: fallbackError } = await adminClient.storage
        .from('posters')
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (fallbackError) {
        console.error('[UPLOAD POSTER] Upload error:', fallbackError);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UPLOAD_FAILED',
              message: 'Failed to upload poster image',
            },
          },
          { status: 500 }
        );
      }

      // 获取 public URL
      const { data: urlData } = adminClient.storage
        .from('posters')
        .getPublicUrl(filePath);

      return NextResponse.json({
        success: true,
        poster_url: urlData.publicUrl,
      });
    }

    if (uploadError) {
      console.error('[UPLOAD POSTER] Upload error:', uploadError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message: 'Failed to upload poster image',
          },
        },
        { status: 500 }
      );
    }

    // 获取 public URL
    const { data: urlData } = adminClient.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      poster_url: urlData.publicUrl,
    });

  } catch (error: any) {
    console.error('[UPLOAD POSTER] Unexpected error:', error);
    
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
