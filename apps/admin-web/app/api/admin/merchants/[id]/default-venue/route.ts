/**
 * GET /api/admin/merchants/[id]/default-venue
 * 获取 merchant 的默认 venue
 * 
 * PATCH /api/admin/merchants/[id]/default-venue
 * 设置 merchant 的默认 venue
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Zod schemas
const MerchantIdSchema = z.string().uuid('merchantId must be a valid UUID');
const SetDefaultVenueSchema = z.object({
  venue_id: z.string().uuid('venue_id must be a valid UUID'),
});

// Response type
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { id: merchantIdParam } = await params;
    
    // 0. 验证merchantId格式
    const merchantIdValidation = MerchantIdSchema.safeParse(merchantIdParam);
    if (!merchantIdValidation.success) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid merchantId: ${merchantIdValidation.error.errors.map(e => e.message).join(', ')}`,
          },
        },
        { status: 400 }
      );
    }
    const merchantId = merchantIdValidation.data;
    
    // 1. 权限检查
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
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
    
    // 检查是否是admin或merchant owner
    const { data: isAdminResult } = await supabase.rpc('is_admin');
    const isAdmin = isAdminResult === true;
    
    if (!isAdmin) {
      // 检查是否是merchant owner
      const { data: membership } = await supabase
        .from('merchant_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('merchant_id', merchantId)
        .eq('is_active', true)
        .eq('role', 'OWNER')
        .single();
      
      if (!membership) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Must be admin or merchant owner',
            },
          },
          { status: 403 }
        );
      }
    }
    
    // 2. 使用admin client查询（绕过RLS）
    const adminClient = createAdminClient();
    
    // 先查询merchant
    const { data: merchant, error: merchantError } = await adminClient
      .from('merchants')
      .select('id, name, default_venue_id')
      .eq('id', merchantId)
      .single();
    
    if (merchantError || !merchant) {
      console.error('[MERCHANT DEFAULT VENUE API] Merchant query error:', merchantError);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Merchant not found',
          },
        },
        { status: 404 }
      );
    }
    
    // 如果有default_venue_id，查询venue详情
    let venue = null;
    if (merchant.default_venue_id) {
      const { data: venueData, error: venueError } = await adminClient
        .from('venues')
        .select('id, name, address, logo_url, description, is_active, region_id')
        .eq('id', merchant.default_venue_id)
        .single();
      
      if (!venueError && venueData && venueData.is_active) {
        // 查询region信息
        let region = null;
        if (venueData.region_id) {
          const { data: regionData, error: regionError } = await adminClient
            .from('regions')
            .select('id, name')
            .eq('id', venueData.region_id)
            .single();
          
          if (!regionError && regionData) {
            region = {
              id: regionData.id,
              name: regionData.name,
            };
          }
        }
        
        venue = {
          id: venueData.id,
          name: venueData.name,
          address: venueData.address,
          logo_url: venueData.logo_url,
          description: venueData.description,
          region_id: venueData.region_id,
          region,
        };
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[MERCHANT DEFAULT VENUE API] Success: Fetched in ${duration}ms`);
    
    return NextResponse.json<ApiResponse<{
      merchant_id: string;
      merchant_name: string;
      default_venue_id: string | null;
      venue: {
        id: string;
        name: string;
        address: string | null;
        logo_url: string | null;
        description: string | null;
        region_id: string | null;
        region: {
          id: string;
          name: string;
        } | null;
      } | null;
    }>>({
      success: true,
      data: {
        merchant_id: merchant.id,
        merchant_name: merchant.name,
        default_venue_id: merchant.default_venue_id,
        venue,
      },
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[MERCHANT DEFAULT VENUE API] Error (${duration}ms):`, error);
    
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { id: merchantIdParam } = await params;
    
    // 0. 验证merchantId格式
    const merchantIdValidation = MerchantIdSchema.safeParse(merchantIdParam);
    if (!merchantIdValidation.success) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid merchantId: ${merchantIdValidation.error.errors.map(e => e.message).join(', ')}`,
          },
        },
        { status: 400 }
      );
    }
    const merchantId = merchantIdValidation.data;
    
    // 1. 权限检查
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
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
    
    // 检查是否是admin或merchant owner
    const { data: isAdminResult } = await supabase.rpc('is_admin');
    const isAdmin = isAdminResult === true;
    
    if (!isAdmin) {
      // 检查是否是merchant owner
      const { data: membership } = await supabase
        .from('merchant_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('merchant_id', merchantId)
        .eq('is_active', true)
        .eq('role', 'OWNER')
        .single();
      
      if (!membership) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Must be admin or merchant owner',
            },
          },
          { status: 403 }
        );
      }
    }
    
    // 2. 验证请求体
    const body = await req.json();
    const validationResult = SetDefaultVenueSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          },
        },
        { status: 400 }
      );
    }
    
    const { venue_id } = validationResult.data;
    
    // 3. 使用admin client验证venue属于该merchant
    const adminClient = createAdminClient();
    
    const { data: venue, error: venueError } = await adminClient
      .from('venues')
      .select('id, merchant_id, is_active')
      .eq('id', venue_id)
      .eq('merchant_id', merchantId)
      .single();
    
    if (venueError || !venue) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Venue not found or does not belong to this merchant',
          },
        },
        { status: 404 }
      );
    }
    
    if (!venue.is_active) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Venue is not active',
          },
        },
        { status: 400 }
      );
    }
    
    // 4. 更新merchant的default_venue_id
    const { data: updatedMerchant, error: updateError } = await adminClient
      .from('merchants')
      .update({ default_venue_id: venue_id })
      .eq('id', merchantId)
      .select('id, name, default_venue_id')
      .single();
    
    if (updateError) {
      console.error('[MERCHANT DEFAULT VENUE API] Update error:', updateError);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: updateError.message || 'Failed to update default venue',
          },
        },
        { status: 500 }
      );
    }
    
    const duration = Date.now() - startTime;
    console.log(`[MERCHANT DEFAULT VENUE API] Success: Updated in ${duration}ms`);
    
    return NextResponse.json<ApiResponse<{
      merchant_id: string;
      default_venue_id: string;
    }>>({
      success: true,
      data: {
        merchant_id: updatedMerchant.id,
        default_venue_id: updatedMerchant.default_venue_id!,
      },
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[MERCHANT DEFAULT VENUE API] Error (${duration}ms):`, error);
    
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
