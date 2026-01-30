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

export async function getDrop(id: string, appType: AppType = 'customer'): Promise<Drop | null> {
  const supabase = createClient({ appType });
  // We allow fetching even if not published? No, customer usage means strict check usually.
  // But if the link is shared, maybe checking status on UI side is better for 'Draft' message.
  // For now, raw fetch.
  const { data, error } = await supabase
    .from('drops')
    .select('*, region:regions(*)')
    .eq('id', id)
    .single();

  if (error) {
     console.error('Error fetching drop:', error);
     return null;
  }
  return data as Drop;
}
