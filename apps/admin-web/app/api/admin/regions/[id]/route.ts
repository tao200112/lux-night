/**
 * GET /api/admin/regions/[id]
 * PUT /api/admin/regions/[id] — { state?, city?, name?, status?, center_lat?, center_lng? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugFromName } from '@/lib/places';
import { rateLimitOrResponse, rateLimitPolicies, withRateLimitHeaders } from '@lux-night/security';

async function requireAdmin() {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, body: { success: false, code: 'UNAUTHORIZED', message: 'Must be logged in' } };
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return { ok: false as const, status: 403, body: { success: false, code: 'FORBIDDEN', message: 'Must be admin' } };
  return { ok: true as const, supabase, admin: (await import('@/lib/supabase/admin')).createAdminClient() };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { id } = await params;
  const { data, error } = await auth.admin.from('regions').select('id, name, slug, city, state, country, status, is_active, center_lat, center_lng').eq('id', id).single();

  if (error || !data) {
    return NextResponse.json({ success: false, code: 'NOT_FOUND', message: 'Region not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await rateLimitOrResponse(req, rateLimitPolicies.sensitivePost, { userId: 'anon' });
  if ('response' in rl) return rl.response;

  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.state != null) {
    const v = String(body.state).trim().toUpperCase().slice(0, 2);
    if (v.length === 2) update.state = v;
  }
  if (body.city != null) update.city = String(body.city).trim() || null;
  if (body.name != null) {
    const n = String(body.name).trim();
    if (n) { update.name = n; update.slug = slugFromName(n); }
  }
  if (body.status != null && ['Operational', 'Maintenance'].includes(body.status)) update.status = body.status;
  if (typeof body.center_lat === 'number') update.center_lat = body.center_lat;
  if (typeof body.center_lng === 'number') update.center_lng = body.center_lng;
  if (typeof body.center_lat === 'number') update.lat = body.center_lat;
  if (typeof body.center_lng === 'number') update.lng = body.center_lng;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, code: 'VALIDATION_ERROR', message: 'No allowed fields to update' }, { status: 400 });
  }

  const { data, error } = await auth.admin.from('regions').update(update).eq('id', id).select('id, name, slug, city, state, country, status, is_active, center_lat, center_lng').single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ success: false, code: 'DUPLICATE', message: 'Slug or unique conflict' }, { status: 409 });
    return NextResponse.json({ success: false, code: 'UPDATE_FAILED', message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}
