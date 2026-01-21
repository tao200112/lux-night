/**
 * GET /api/admin/venues
 * 获取所有 venues（用于管理员创建活动时选择）
 * 
 * Query Parameters:
 * - merchant_id (optional): UUID，过滤指定商户的venues
 * 
 * Response:
 * - success: boolean
 * - data: Venue[]
 * - error: { code: string, message: string } | null
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Zod schema for query validation
const VenuesQuerySchema = z.object({
  merchant_id: z.string().uuid().optional(),
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

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. 权限检查（使用普通client检查用户身份）
    let supabase;
    try {
      supabase = await createClient();
    } catch (err: any) {
      console.error('[ADMIN VENUES API] Failed to create client:', err);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Failed to initialize client',
          },
        },
        { status: 500 }
      );
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[ADMIN VENUES API] Auth error:', authError);
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
    const { data: isAdminResult, error: adminCheckError } = await supabase.rpc('is_admin');
    
    if (adminCheckError) {
      console.error('[ADMIN VENUES API] Admin check error:', adminCheckError);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: `Failed to verify admin status: ${adminCheckError.message}`,
          },
        },
        { status: 500 }
      );
    }
    
    // RPC 返回的是 boolean 值，直接使用
    const isAdmin = isAdminResult === true;
    
    if (!isAdmin) {
      console.warn(`[ADMIN VENUES API] Non-admin user ${user.id} attempted to access venues`);
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
    
    // 2. 验证query parameters
    const searchParams = req.nextUrl.searchParams;
    const queryParams = {
      merchant_id: searchParams.get('merchant_id') || undefined,
    };
    
    const validationResult = VenuesQuerySchema.safeParse(queryParams);
    
    if (!validationResult.success) {
      console.error('[ADMIN VENUES API] Validation error:', validationResult.error);
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
    
    const { merchant_id } = validationResult.data;
    
    // 3. 使用admin client查询venues（绕过RLS）
    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (err: any) {
      console.error('[ADMIN VENUES API] Failed to create admin client:', err);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Failed to initialize admin client. Check SUPABASE_SERVICE_ROLE_KEY.',
          },
        },
        { status: 500 }
      );
    }
    
    // 确保adminClient不为null
    if (!adminClient) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Admin client is null',
          },
        },
        { status: 500 }
      );
    }
    
    // 如果指定了merchant_id，优先返回该merchant的default venue（如果存在）
    // 否则返回该merchant的所有active venues
    if (merchant_id) {
      // 先查询merchant的default_venue_id
      const { data: merchant, error: merchantError } = await adminClient
        .from('merchants')
        .select('default_venue_id')
        .eq('id', merchant_id)
        .single();
      
      if (merchantError) {
        console.error('[ADMIN VENUES API] Merchant query error:', merchantError);
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'DB_ERROR',
              message: `Merchant not found: ${merchantError.message}`,
            },
          },
          { status: 404 }
        );
      }
      
      // 如果有default_venue_id，优先返回它
      if (merchant?.default_venue_id) {
        const { data: defaultVenue, error: venueError } = await adminClient
          .from('venues')
          .select(`
            id,
            name,
            address,
            logo_url,
            description,
            merchant_id,
            merchants(
              id,
              name
            )
          `)
          .eq('id', merchant.default_venue_id)
          .eq('is_active', true)
          .single();
        
        if (!venueError && defaultVenue) {
          const formattedVenue = {
            id: defaultVenue.id,
            name: defaultVenue.name,
            address: defaultVenue.address,
            logo_url: defaultVenue.logo_url,
            description: defaultVenue.description,
            merchant: defaultVenue.merchants && (Array.isArray(defaultVenue.merchants) ? defaultVenue.merchants[0] : defaultVenue.merchants) ? {
              id: Array.isArray(defaultVenue.merchants) ? defaultVenue.merchants[0].id : defaultVenue.merchants.id,
              name: Array.isArray(defaultVenue.merchants) ? defaultVenue.merchants[0].name : defaultVenue.merchants.name,
            } : null,
          };
          
          const duration = Date.now() - startTime;
          console.log(`[ADMIN VENUES API] Success: Default venue fetched in ${duration}ms`);
          
          return NextResponse.json<ApiResponse<typeof formattedVenue[]>>({
            success: true,
            data: [formattedVenue],
          });
        }
      }
      
      // 如果没有default venue或查询失败，返回该merchant的所有active venues
      // 先查询merchant信息（用于返回）
      let merchantInfo;
      try {
        const { data: merchantData, error: merchantInfoError } = await adminClient
          .from('merchants')
          .select('id, name')
          .eq('id', merchant_id)
          .single();
        
        if (merchantInfoError) {
          console.error('[ADMIN VENUES API] Merchant info query error:', JSON.stringify(merchantInfoError, null, 2));
          return NextResponse.json<ApiResponse<never>>(
            {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: `Merchant not found: ${merchantInfoError.message}`,
              },
            },
            { status: 404 }
          );
        }
        
        if (!merchantData) {
          console.error('[ADMIN VENUES API] Merchant not found:', merchant_id);
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
        
        merchantInfo = merchantData;
      } catch (err: any) {
        console.error('[ADMIN VENUES API] Exception while querying merchant:', err);
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: `Failed to query merchant: ${err.message}`,
            },
          },
          { status: 500 }
        );
      }
      
      // 查询venues（包含region信息）
      let venues;
      try {
        const { data: venuesData, error: queryError } = await adminClient
          .from('venues')
          .select('id, name, address, logo_url, description, merchant_id, region_id')
          .eq('merchant_id', merchant_id)
          .eq('is_active', true)
          .order('name');
        
        if (queryError) {
          console.error('[ADMIN VENUES API] Venues query error:', JSON.stringify(queryError, null, 2));
          return NextResponse.json<ApiResponse<never>>(
            {
              success: false,
              error: {
                code: 'DB_ERROR',
                message: `Failed to fetch venues: ${queryError.message}`,
              },
            },
            { status: 500 }
          );
        }
        
        venues = venuesData || [];
      } catch (err: any) {
        console.error('[ADMIN VENUES API] Exception while querying venues:', err);
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: `Failed to query venues: ${err.message}`,
            },
          },
          { status: 500 }
        );
      }
      
      // 如果没有venues，返回空数组
      if (!venues || venues.length === 0) {
        const duration = Date.now() - startTime;
        console.log(`[ADMIN VENUES API] Success: No venues found for merchant ${merchant_id} in ${duration}ms`);
        return NextResponse.json<ApiResponse<never[]>>({
          success: true,
          data: [],
        });
      }
      
      // 查询regions信息（批量查询）
      const regionIds = [...new Set(venues.map((v: any) => v.region_id).filter(Boolean))];
      let regionsMap = new Map();
      
      if (regionIds.length > 0) {
        try {
          const { data: regions, error: regionsError } = await adminClient
            .from('regions')
            .select('id, name')
            .in('id', regionIds);
          
          if (!regionsError && regions) {
            regionsMap = new Map(regions.map((r: any) => [r.id, r]));
          }
        } catch (err: any) {
          console.warn('[ADMIN VENUES API] Failed to fetch regions:', err);
          // 不阻断流程，继续返回venues
        }
      }
      
      // 格式化venues，添加merchant和region信息
      const formattedVenues = venues.map((v: any) => {
        const region = regionsMap.get(v.region_id);
        return {
          id: v.id,
          name: v.name,
          address: v.address,
          logo_url: v.logo_url,
          description: v.description,
          region_id: v.region_id,
          region: region ? {
            id: region.id,
            name: region.name,
          } : null,
          merchant: {
            id: merchantInfo.id,
            name: merchantInfo.name,
          },
        };
      });
      
      const duration = Date.now() - startTime;
      console.log(`[ADMIN VENUES API] Success: ${formattedVenues.length} venues fetched in ${duration}ms`);
      
      return NextResponse.json<ApiResponse<typeof formattedVenues>>({
        success: true,
        data: formattedVenues,
      });
    }
    
    // 如果没有指定merchant_id，返回所有active venues
    // 查询所有venues（包含region信息）
    let venues;
    try {
      const { data: venuesData, error: queryError } = await adminClient
        .from('venues')
        .select('id, name, address, logo_url, description, merchant_id, region_id')
        .eq('is_active', true)
        .order('name');
      
      if (queryError) {
        console.error('[ADMIN VENUES API] Query error:', JSON.stringify(queryError, null, 2));
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: {
              code: 'DB_ERROR',
              message: `Failed to fetch venues: ${queryError.message}`,
            },
          },
          { status: 500 }
        );
      }
      
      venues = venuesData || [];
    } catch (err: any) {
      console.error('[ADMIN VENUES API] Exception while querying venues:', err);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: `Failed to query venues: ${err.message}`,
          },
        },
        { status: 500 }
      );
    }
    
    // 如果没有venues，返回空数组
    if (!venues || venues.length === 0) {
      const duration = Date.now() - startTime;
      console.log(`[ADMIN VENUES API] Success: No venues found in ${duration}ms`);
      return NextResponse.json<ApiResponse<never[]>>({
        success: true,
        data: [],
      });
    }
    
    // 获取所有merchant_id和region_id，批量查询
    const merchantIds = [...new Set(venues.map((v: any) => v.merchant_id).filter(Boolean))];
    const regionIds = [...new Set(venues.map((v: any) => v.region_id).filter(Boolean))];
    
    // 批量查询merchants
    let merchantMap = new Map();
    if (merchantIds.length > 0) {
      try {
        const { data: merchants, error: merchantsError } = await adminClient
          .from('merchants')
          .select('id, name')
          .in('id', merchantIds);
        
        if (!merchantsError && merchants) {
          merchantMap = new Map(merchants.map((m: any) => [m.id, m]));
        }
      } catch (err: any) {
        console.warn('[ADMIN VENUES API] Failed to fetch merchants:', err);
      }
    }
    
    // 批量查询regions
    let regionsMap = new Map();
    if (regionIds.length > 0) {
      try {
        const { data: regions, error: regionsError } = await adminClient
          .from('regions')
          .select('id, name')
          .in('id', regionIds);
        
        if (!regionsError && regions) {
          regionsMap = new Map(regions.map((r: any) => [r.id, r]));
        }
      } catch (err: any) {
        console.warn('[ADMIN VENUES API] Failed to fetch regions:', err);
      }
    }
    
    // 4. 格式化响应
    const formattedVenues = venues
      .map((v: any) => {
        const merchant = merchantMap.get(v.merchant_id);
        const region = regionsMap.get(v.region_id);
        
        if (!merchant) {
          return null; // 跳过没有merchant的venue
        }
        
        return {
          id: v.id,
          name: v.name,
          address: v.address,
          logo_url: v.logo_url,
          description: v.description,
          region_id: v.region_id,
          region: region ? {
            id: region.id,
            name: region.name,
          } : null,
          merchant: {
            id: merchant.id,
            name: merchant.name,
          },
        };
      })
      .filter((v: any) => v !== null);
    
    const duration = Date.now() - startTime;
    console.log(`[ADMIN VENUES API] Success: ${formattedVenues.length} venues fetched in ${duration}ms`);
    
    return NextResponse.json<ApiResponse<typeof formattedVenues>>({
      success: true,
      data: formattedVenues,
    });
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[ADMIN VENUES API] Unexpected error (${duration}ms):`, error);
    
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
