/**
 * POST /api/admin/uploads/poster
 * 上传活动海报到 Supabase Storage（管理员端）
 * 
 * Form Data:
 * - file: File (required) - 图片文件
 * - merchant_id: string (optional) - 商户ID，用于组织文件路径
 * - event_id: string (optional) - 活动ID，如果已有活动ID
 * 
 * Response:
 * - success: boolean
 * - data: { poster_url: string, file_path: string, signed_url?: string }
 * - error: { code: string, message: string } | null
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

// Allowed file types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const BUCKET_NAME = 'event-posters';

// Response type
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
    if ('response' in rl) return rl.response;

    // 1. 权限检查（使用普通client检查用户身份）
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[POSTER UPLOAD API] Auth error:', authError);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Must be logged in',
          },
        },
        { status: 401 }
      );
    }
    
    // 检查是否是admin
    const { data: isAdmin, error: adminCheckError } = await supabase.rpc('is_admin');
    
    if (adminCheckError) {
      console.error('[POSTER UPLOAD API] Admin check error:', adminCheckError);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to verify admin status',
          },
        },
        { status: 500 }
      );
    }
    
    if (!isAdmin) {
      console.warn(`[POSTER UPLOAD API] Non-admin user ${user.id} attempted to upload poster`);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Must be admin',
          },
        },
        { status: 403 }
      );
    }
    
    // 2. 解析 FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const merchantId = formData.get('merchant_id') as string | null;
    const eventId = formData.get('event_id') as string | null;
    
    // 3. 验证文件
    if (!file) {
      return NextResponse.json<ApiResponse<never>>(
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
    
    // 验证文件类型
    if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Only ${ALLOWED_MIME_TYPES.join(', ')} images are allowed`,
          },
        },
        { status: 400 }
      );
    }
    
    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          },
        },
        { status: 400 }
      );
    }
    
    // 验证 merchant_id（如果提供）
    if (merchantId) {
      const uuidSchema = z.string().uuid();
      const merchantIdResult = uuidSchema.safeParse(merchantId);
      if (!merchantIdResult.success) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid merchant_id format (must be UUID)',
            },
          },
          { status: 400 }
        );
      }
    }
    
    // 验证 event_id（如果提供）
    if (eventId) {
      const uuidSchema = z.string().uuid();
      const eventIdResult = uuidSchema.safeParse(eventId);
      if (!eventIdResult.success) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid event_id format (must be UUID)',
            },
          },
          { status: 400 }
        );
      }
    }
    
    // 4. 生成文件路径
    // 格式：merchants/{merchantId}/events/{eventId or 'drafts'}/{uuid}.{ext}
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${randomUUID()}.${fileExt}`;
    
    let filePath: string;
    if (merchantId) {
      const eventFolder = eventId || 'drafts';
      filePath = `merchants/${merchantId}/events/${eventFolder}/${fileName}`;
    } else {
      // 如果没有 merchant_id，使用 admin 文件夹（向后兼容）
      filePath = `admin/${Date.now()}-${randomUUID()}.${fileExt}`;
    }
    
    // 5. 转换为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 6. 使用 admin client 上传（绕过 RLS）
    const adminClient = createAdminClient();
    
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: '3600',
      });
    
    if (uploadError) {
      console.error('[POSTER UPLOAD API] Upload error:', uploadError);
      
      // 检查是否是 bucket 不存在
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'BUCKET_NOT_FOUND',
              message: `Storage bucket "${BUCKET_NAME}" not found. Please create it in Supabase Dashboard → Storage`,
            },
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message: uploadError.message || 'Failed to upload file',
          },
        },
        { status: 500 }
      );
    }
    
    if (!uploadData) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message: 'Upload succeeded but no data returned',
          },
        },
        { status: 500 }
      );
    }
    
    // 7. 获取 URL
    // 尝试获取 public URL（如果 bucket 是 public）
    const { data: { publicUrl } } = adminClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);
    
    // 如果 bucket 是 private，生成 signed URL（有效期 1 年）
    let signedUrl: string | undefined;
    try {
      const { data: signedData, error: signedError } = await adminClient.storage
        .from(BUCKET_NAME)
        .createSignedUrl(filePath, 31536000); // 1 year
      
      if (!signedError && signedData) {
        signedUrl = signedData.signedUrl;
      }
    } catch (err) {
      // 如果生成 signed URL 失败，忽略（使用 public URL）
      console.warn('[POSTER UPLOAD API] Failed to generate signed URL:', err);
    }
    
    const duration = Date.now() - startTime;
    console.log(`[POSTER UPLOAD API] Success: ${filePath} uploaded in ${duration}ms (${(file.size / 1024).toFixed(2)}KB)`);
    
    return NextResponse.json<ApiResponse<{
      poster_url: string;
      file_path: string;
      signed_url?: string;
    }>>({
      success: true,
      data: {
        poster_url: publicUrl,
        file_path: uploadData.path,
        signed_url: signedUrl,
      },
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[POSTER UPLOAD API] Unexpected error (${duration}ms):`, error);
    
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'An unexpected error occurred',
        },
      },
      { status: 500 }
    );
  }
}
