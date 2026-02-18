'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribe to events_v2 table changes (e.g. sort_order updates).
 * On UPDATE, calls onUpdate so Discover can refetch the list.
 */
export function useEventsRealtime(onUpdate: () => void) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('events-v2-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events_v2',
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}
