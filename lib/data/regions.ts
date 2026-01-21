import { createClient } from '@/lib/supabase/client';

export interface Region {
  id: string;
  name: string;
  state: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getRegions(): Promise<Region[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching regions:', error);
    throw new Error('Failed to fetch regions');
  }

  return data || [];
}

export async function getRegion(id: string): Promise<Region | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching region:', error);
    return null;
  }

  return data;
}
