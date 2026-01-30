
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const createDropSchema = z.object({
  region_id: z.string().uuid(),
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  poster_url: z.string().optional().nullable(),
  status: z.enum(['draft', 'published']).default('draft'),
  published_at: z.string().optional().nullable()
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const regionId = req.nextUrl.searchParams.get('region_id');
    
    const admin = createAdminClient();
    let query = admin.from('drops').select('*, region:regions(name)').order('created_at', { ascending: false });
    
    if (regionId) {
        query = query.eq('region_id', regionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const validation = createDropSchema.safeParse(body);
    
    if (!validation.success) {
        return NextResponse.json({ success: false, error: validation.error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    const payload = {
        ...validation.data,
        published_at: validation.data.status === 'published' ? (validation.data.published_at || new Date().toISOString()) : null
    };

    const { data, error } = await admin.from('drops').insert(payload).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
