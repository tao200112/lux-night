import React from 'react';
import { cookies } from 'next/headers';
import { AuthProvider } from '../contexts/AuthContext';
import { RegionProvider } from '../contexts/RegionContext';
import { createClient } from '../lib/supabase/server';
import type { Region } from '@/lib/data/regions';
import './globals.css';
import type { Metadata } from 'next';

const COOKIE_REGION = 'current_region_id';

export const metadata: Metadata = {
  title: 'Lux Night',
  description: 'Discover and book premium nightlife experiences',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialRegion: Region | null = null;
  try {
    const cookieStore = await cookies();
    const regionId = cookieStore.get(COOKIE_REGION)?.value ?? null;
    if (regionId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('regions')
        .select('*')
        .eq('id', regionId)
        .eq('is_active', true)
        .maybeSingle();
      if (data) {
        initialRegion = {
          id: data.id,
          name: data.name,
          state: data.state,
          country: data.country,
          lat: data.lat,
          lng: data.lng,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }
    }
  } catch (e) {
    // ignore
  }

  return (
    <html lang="en" className="dark">
      <body className="bg-background-dark text-white font-sans antialiased">
        <AuthProvider>
          <RegionProvider initialRegion={initialRegion}>
            {children}
          </RegionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
