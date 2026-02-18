'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribe to events_v2 changes for a given event.
 * On UPDATE, calls onUpdate so the parent can refetch.
 * Does not trigger full page reload.
 */
export function useEventRealtime(eventId: string | null, onUpdate: () => void) {
  useEffect(() => {
    if (!eventId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`event-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events_v2',
          filter: `id=eq.${eventId}`,
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, onUpdate]);
}
