'use client';

import { createClient } from '@/lib/supabase/client';
import { ensureProfile } from '@/lib/data/profile';
import { User } from '@supabase/supabase-js';

export interface Session {
  user: User;
}

export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }

  if (!session?.user) {
    return null;
  }

  return { user: session.user };
}

export async function getUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user || null;
}

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
}

export async function signInWithApple(redirectTo?: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    console.error('Error signing in with Apple:', error);
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

export async function requireAuth(): Promise<User> {
  const user = await getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  
  // Ensure profile exists
  try {
    await ensureProfile(user.id, user.email);
  } catch (error) {
    console.error('Error ensuring profile:', error);
    // Continue anyway - profile creation might fail but shouldn't block auth
  }

  return user;
}
