import { createClient } from '@/lib/supabase/client';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  last_region_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return data;
}

export async function ensureProfile(userId: string, email?: string): Promise<Profile> {
  const supabase = createClient();
  
  // Try to get existing profile
  const existing = await getProfile(userId);
  if (existing) {
    return existing;
  }

  // Create new profile
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      display_name: email?.split('@')[0] || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    throw new Error('Failed to create profile');
  }

  return data;
}

export async function updateProfileRegion(userId: string, regionId: string): Promise<void> {
  const supabase = createClient();
  
  const { error } = await supabase
    .from('profiles')
    .update({ last_region_id: regionId })
    .eq('id', userId);

  if (error) {
    console.error('Error updating profile region:', error);
    throw new Error('Failed to update profile region');
  }
}
