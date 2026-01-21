import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { ensureProfile } from '@/lib/data/profile';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  let redirectTo = requestUrl.searchParams.get('redirect') || '/';

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Get user and ensure profile exists
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try {
        await ensureProfile(user.id, user.email || undefined);
      } catch (error) {
        console.error('Error ensuring profile after auth:', error);
      }
    }

    // After successful login, always redirect to home first (reset navigation stack)
    // If redirectTo was a specific page, it will be handled by client-side navigation
    // This ensures the navigation history is clean: Login -> Home (not Login -> Profile)
    redirectTo = '/';
  }

  return NextResponse.redirect(new URL(redirectTo, request.url));
}
