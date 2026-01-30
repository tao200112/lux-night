import { createClient, type AppType } from '../supabase/client';
import type { Drop } from '../types';

export async function getPublishedDrops(regionId: string, appType: AppType = 'customer'): Promise<Drop[]> {
  const supabase = createClient({ appType });
  const { data, error } = await supabase
    .from('drops')
    .select('*, region:regions(*)')
    .eq('status', 'published')
    .eq('region_id', regionId)
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
     console.error('Error fetching drops:', error);
     throw error;
  }
  return (data || []) as Drop[];
}
