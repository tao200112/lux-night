/**
 * Staff Data Fetching Utilities
 * 员工数据获取工具
 */

import { createClient } from '@/lib/supabase/server';

export async function getStaffByWorkspace(merchantId: string) {
  const supabase = await createClient();
  
  const { data: members, error } = await supabase
    .from('merchant_members')
    .select(`
      *,
      profiles:user_id (
        id,
        display_name,
        email,
        avatar_url
      )
    `)
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  
  if (error) {
    throw error;
  }
  
  return members || [];
}

export async function getStaffMemberById(memberId: string, merchantId: string) {
  const supabase = await createClient();

  const { data: member, error } = await supabase
    .from('merchant_members')
    .select(`
      id,
      user_id,
      role,
      is_active,
      display_name,
      created_at,
      profiles:user_id (
        id,
        display_name,
        email,
        avatar_url
      )
    `)
    .eq('id', memberId)
    .eq('merchant_id', merchantId)
    .single();

  if (error || !member) {
    return null;
  }

  const profile = (member as any).profiles;
  const displayName = (member as any).display_name || profile?.display_name || profile?.email?.split('@')[0] || 'Staff';

  return {
    id: member.id,
    userId: member.user_id,
    role: member.role,
    isActive: member.is_active,
    displayName: (member as any).display_name ?? undefined,
    user: {
      id: profile?.id,
      email: profile?.email,
      profile: {
        full_name: displayName,
        avatar_url: profile?.avatar_url,
      },
    },
  };
}

export async function updateStaffStatus(
  memberId: string,
  status: { isActive?: boolean; role?: string; displayName?: string }
) {
  const supabase = await createClient();
  
  const updateData: any = {};
  if (status.isActive !== undefined) {
    updateData.is_active = status.isActive;
  }
  if (status.role !== undefined) {
    updateData.role = status.role;
  }
  if (status.displayName !== undefined) {
    updateData.display_name = status.displayName.trim() || null;
  }
  
  const { data: member, error } = await supabase
    .from('merchant_members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single();
  
  if (error) {
    throw error;
  }
  
  return member;
}
