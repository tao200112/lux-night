import { createClient } from '@/lib/supabase/client';

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  category: 'ENTRY' | 'DRINK';
  price_cents: number;
  currency: string;
  inventory_limit: number | null;
  sold_count: number;
  redeem_limit: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getTicketTypes(eventId: string): Promise<TicketType[]> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('price_cents', { ascending: true });

  if (error) {
    console.error('Error fetching ticket types:', error);
    throw new Error('Failed to fetch ticket types');
  }

  return data || [];
}

export async function getTicketType(id: string): Promise<TicketType | null> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching ticket type:', error);
    return null;
  }

  return data;
}
