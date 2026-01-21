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

export async function updateStaffStatus(
  memberId: string,
  status: { isActive?: boolean; role?: string }
) {
  const supabase = await createClient();
  
  const updateData: any = {};
  if (status.isActive !== undefined) {
    updateData.is_active = status.isActive;
  }
  if (status.role !== undefined) {
    updateData.role = status.role;
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
