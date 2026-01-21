import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function getSession() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }

  return session;
}

export async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

export async function requireAuth() {
  const user = await getUser();
  
  if (!user) {
    redirect('/login?redirect=' + encodeURIComponent('/'));
  }

  // 注意：不再调用 ensureProfile，因为 DB trigger 会自动创建 profile

  return user;
}
