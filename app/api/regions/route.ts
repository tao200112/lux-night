import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: regions, error } = await supabase
      .from('regions')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch regions' }, { status: 500 });
    }

    return NextResponse.json({ regions: regions || [] });
  } catch (error: any) {
    console.error('Regions fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch regions' },
      { status: 500 }
    );
  }
}
