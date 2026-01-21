import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { regionId } = body;

    if (!regionId) {
      return NextResponse.json({ error: 'Region ID is required' }, { status: 400 });
    }

    // Verify region exists and is active
    const { data: region, error: regionError } = await supabase
      .from('regions')
      .select('id')
      .eq('id', regionId)
      .eq('is_active', true)
      .single();

    if (regionError || !region) {
      return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
    }

    // Update user profile with region (last_region_id in new schema)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ last_region_id: regionId })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update region' }, { status: 500 });
    }

    return NextResponse.json({ success: true, regionId });
  } catch (error: any) {
    console.error('Region update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update region' },
      { status: 500 }
    );
  }
}
