import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ensureProfile } from '@/lib/data/profile';

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

  // Ensure profile exists
  try {
    await ensureProfile(user.id, user.email || undefined);
  } catch (error) {
    console.error('Error ensuring profile:', error);
    // Continue anyway
  }

  return user;
}
