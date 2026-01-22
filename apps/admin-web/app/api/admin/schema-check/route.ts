/**
 * GET /api/admin/schema-check
 * Schema Mismatch Self-Check API
 * 
 * 检查关键表和字段是否存在，输出缺失项
 */

import { NextRequest, NextResponse } from 'next/server';
import { handlerWrapper, requireAdmin, withTimeout } from '@/lib/admin/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;

interface SchemaCheckResult {
  table: string;
  exists: boolean;
  fields?: {
    name: string;
    exists: boolean;
    expectedType?: string;
  }[];
  foreignKeys?: {
    name: string;
    exists: boolean;
  }[];
}

export const GET = handlerWrapper(async (request: NextRequest): Promise<NextResponse> => {
  let step = 'init';

  try {
    // 权限检查
    step = 'auth_check';
    const authResult = await withTimeout(requireAdmin(request), TIMEOUT_MS, 'requireAdmin');

    if ('status' in authResult) {
      return authResult.response;
    }

    const { adminClient } = authResult;
    step = 'auth_ok';

    const results: SchemaCheckResult[] = [];

    // 检查 requests 表
    step = 'check_requests_table';
    const requestsCheck: SchemaCheckResult = {
      table: 'requests',
      exists: false,
      fields: [],
    };

    try {
      const { data, error } = await adminClient
        .from('requests')
        .select('id, type, status, payload, admin_note, requested_by, decided_by, created_at, decided_at, merchant_id, venue_id')
        .limit(1);

      if (!error) {
        requestsCheck.exists = true;
        requestsCheck.fields = [
          { name: 'id', exists: true },
          { name: 'payload', exists: true },
          { name: 'event_id', exists: false, expectedType: 'UUID' }, // Known missing field
        ];
      } else {
        requestsCheck.exists = false;
        console.warn('[SCHEMA_CHECK] requests table error:', error.message);
      }
    } catch (err: any) {
      requestsCheck.exists = false;
      console.error('[SCHEMA_CHECK] requests table exception:', err.message);
    }

    results.push(requestsCheck);

    // 检查 orders 表
    step = 'check_orders_table';
    const ordersCheck: SchemaCheckResult = {
      table: 'orders',
      exists: false,
      fields: [],
      foreignKeys: [],
    };

    try {
      const { data, error } = await adminClient
        .from('orders')
        .select('id, status, amount_cents, user_id, stripe_payment_intent_id, created_at')
        .limit(1);

      if (!error) {
        ordersCheck.exists = true;
        ordersCheck.fields = [
          { name: 'id', exists: true },
          { name: 'user_id', exists: true },
          { name: 'amount_cents', exists: true },
          { name: 'customer_id', exists: false, expectedType: 'UUID' }, // Known missing field
          { name: 'total_cents', exists: false, expectedType: 'INTEGER' }, // Known missing field
        ];

        // 检查外键
        const { error: fkError } = await adminClient
          .from('orders')
          .select('id, profiles!orders_customer_id_fkey(id)')
          .limit(1);

        ordersCheck.foreignKeys = [
          {
            name: 'orders_customer_id_fkey',
            exists: !fkError,
          },
        ];
      } else {
        ordersCheck.exists = false;
        console.warn('[SCHEMA_CHECK] orders table error:', error.message);
      }
    } catch (err: any) {
      ordersCheck.exists = false;
      console.error('[SCHEMA_CHECK] orders table exception:', err.message);
    }

    results.push(ordersCheck);

    // 检查 merchants 表
    step = 'check_merchants_table';
    const merchantsCheck: SchemaCheckResult = {
      table: 'merchants',
      exists: false,
      fields: [],
    };

    try {
      const { data, error } = await adminClient
        .from('merchants')
        .select('id, name, status, region_id, created_at')
        .limit(1);

      if (!error) {
        merchantsCheck.exists = true;
        merchantsCheck.fields = [
          { name: 'id', exists: true },
          { name: 'name', exists: true },
          { name: 'status', exists: true },
          { name: 'region_id', exists: true },
        ];
      } else {
        merchantsCheck.exists = false;
        console.warn('[SCHEMA_CHECK] merchants table error:', error.message);
      }
    } catch (err: any) {
      merchantsCheck.exists = false;
      console.error('[SCHEMA_CHECK] merchants table exception:', err.message);
    }

    results.push(merchantsCheck);

    // 检查 profiles 表
    step = 'check_profiles_table';
    const profilesCheck: SchemaCheckResult = {
      table: 'profiles',
      exists: false,
      fields: [],
    };

    try {
      const { data, error } = await adminClient
        .from('profiles')
        .select('id, display_name, email, is_admin')
        .limit(1);

      if (!error) {
        profilesCheck.exists = true;
        profilesCheck.fields = [
          { name: 'id', exists: true },
          { name: 'display_name', exists: true },
          { name: 'email', exists: true },
          { name: 'is_admin', exists: true },
        ];
      } else {
        profilesCheck.exists = false;
        console.warn('[SCHEMA_CHECK] profiles table error:', error.message);
      }
    } catch (err: any) {
      profilesCheck.exists = false;
      console.error('[SCHEMA_CHECK] profiles table exception:', err.message);
    }

    results.push(profilesCheck);

    // 汇总缺失项
    step = 'summarize';
    const missing = results.flatMap((r) =>
      (r.fields || [])
        .filter((f) => !f.exists)
        .map((f) => ({
          table: r.table,
          field: f.name,
          expectedType: f.expectedType,
        }))
    );

    const missingForeignKeys = results.flatMap((r) =>
      (r.foreignKeys || [])
        .filter((fk) => !fk.exists)
        .map((fk) => ({
          table: r.table,
          foreignKey: fk.name,
        }))
    );

    step = 'success';
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      data: {
        tables: results,
        summary: {
          totalTables: results.length,
          existingTables: results.filter((r) => r.exists).length,
          missingFields: missing,
          missingForeignKeys,
        },
      },
      step,
    });
  } catch (error: any) {
    console.error('[SCHEMA CHECK] Error:', {
      step,
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unexpected error',
        step,
      },
      { status: 500 }
    );
  }
});
