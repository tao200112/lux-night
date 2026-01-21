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

/**
 * @deprecated 不要在前端直接创建 profile
 * 使用 /api/profile/ensure API 来确保 profile 存在（使用 service role）
 */
export async function ensureProfile(userId: string, email?: string): Promise<Profile> {
  // 调用 server API 来确保 profile 存在
  const res = await fetch('/api/profile/ensure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to ensure profile');
  }

  const { profile } = await res.json();
  return profile;
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
