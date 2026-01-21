/**
 * Internal Staff Data Queries
 * 内部端员工数据查询函数
 */

import { createClient } from '@/lib/supabase/server';

export interface StaffMember {
  id: string;
  userId: string;
  merchantId: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'admin';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    email: string | null;
  };
  venues: Array<{
    venueId: string;
    venueName: string;
  }>;
}

/**
 * 获取merchant的员工列表
 */
export async function getStaffMembers(merchantId: string): Promise<StaffMember[]> {
  const supabase = await createClient();

  const { data: members, error } = await supabase
    .from('merchant_members')
    .select(`
      id,
      user_id,
      merchant_id,
      role,
      is_active,
      created_at,
      updated_at,
      profiles!inner(
        id,
        display_name,
        avatar_url
      )
    `)
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (error || !members) {
    return [];
  }

  // 获取每个成员的venue访问权限和用户email
  const staffMembers: StaffMember[] = await Promise.all(
    members.map(async (member: any) => {
      // 注意：获取用户email需要通过profiles表或其他方式，不能直接使用admin API
      // 这里暂时使用profiles表的display_name作为用户标识
      const userEmail = member.profiles?.email || null; // 如果需要email，可能需要单独的查询
      
      // 获取member_venues
      const { data: memberVenues } = await supabase
        .from('member_venues')
        .select(`
          venue_id,
          venues!inner(
            id,
            name
          )
        `)
        .eq('member_id', member.id);

      const venues = memberVenues?.map((mv: any) => ({
        venueId: mv.venue_id,
        venueName: mv.venues.name,
      })) || [];

      return {
        id: member.id,
        userId: member.user_id,
        merchantId: member.merchant_id,
        role: member.role,
        isActive: member.is_active,
        createdAt: member.created_at,
        updatedAt: member.updated_at,
        user: {
          id: member.profiles.id,
          displayName: member.profiles.display_name,
          avatarUrl: member.profiles.avatar_url,
          email: userEmail,
        },
        venues,
      };
    })
  );

  return staffMembers;
}

/**
 * 更新员工状态（启用/禁用）
 */
export async function updateStaffStatus(
  memberId: string,
  isActive: boolean
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('merchant_members')
    .update({ is_active: isActive })
    .eq('id', memberId);

  if (error) {
    throw new Error('UPDATE_FAILED');
  }
}
