
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const updateDropSchema = z.object({
  region_id: z.string().uuid().optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  poster_url: z.string().optional().nullable(),
  status: z.enum(['draft', 'published']).optional(),
  published_at: z.string().optional().nullable()
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const validation = updateDropSchema.safeParse(body);
    
    if (!validation.success) {
        return NextResponse.json({ success: false, error: validation.error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    
    // Logic for published_at update
    let updates: any = { ...validation.data };
    if (validation.data.status === 'published' && !validation.data.published_at) {
        // If switching to published and no date provided, set now.
        // We should check if it was already published to avoid overwriting?
        // Simple logic: if payload status is published, use supplied date or now.
        updates.published_at = new Date().toISOString();
        // If user explicitly sent null/undefined, validation handles it, but here we enforce logic.
    } 
    // If status is draft, clear published_at?
    if (validation.data.status === 'draft') {
        updates.published_at = null;
    }

    const { data, error } = await admin.from('drops').update(updates).eq('id', id).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.from('drops').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
