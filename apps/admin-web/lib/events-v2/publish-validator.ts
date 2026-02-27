import { SupabaseClient } from '@supabase/supabase-js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateEventForPublish(
  supabase: SupabaseClient,
  eventId: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // 1. Fetch Event Basic Info
  const { data: event, error: eventError } = await supabase
    .from('events_v2')
    .select('*')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { valid: false, errors: ['Event not found'] };
  }

  // A) Basic Info
  if (!event.title || !event.title.trim()) {
    errors.push('Event Title is required.');
  }
  if (!event.poster_url || !event.poster_url.trim()) {
    errors.push('Event Poster is required.');
  }

  // B) Week Config Validation
  // Need to fetch current week config. We use the RPC or query tables directly.
  // Tables directly is safer for "permanent config" check.
  
  // Find the event week. V2 Event has permanent weeks, usually we check the "current/default" one.
  // Actually, V2 model implies the weeks are generated on fly or stored. 
  // Let's assume we validate the *latest* or *any* existing week config attached to this event.
  // Or better: Use the same logic as GET /week - fetch the week for "today" (or generic).
  // AND check if it has valid days.
  
  const { data: weeks, error: weeksError } = await supabase
    .from('event_weeks')
    .select('id')
    .eq('event_id', eventId);

  if (weeksError || !weeks || weeks.length === 0) {
    errors.push('No weekly configuration found. Please configure the weekly schedule.');
    return { valid: false, errors };
  }

  let hasEnabledDay = false;
  for (const eventWeek of weeks) {
    const { data: days, error: daysError } = await supabase
      .from('event_week_days')
      .select(`
        id,
        dow,
        enabled,
        ticket_types_v2 (
          id,
          name,
          price_cents,
          status,
          min_age,
          inventory_limit
        )
      `)
      .eq('event_week_id', eventWeek.id);

    if (daysError || !days) {
      errors.push('Failed to load weekly schedule.');
      return { valid: false, errors };
    }

    const enabledDays = days.filter((d: any) => d.enabled);
    if (enabledDays.length > 0) hasEnabledDay = true;

    for (const day of enabledDays) {
      const tickets = day.ticket_types_v2 || [];
      const activeTickets = tickets.filter((t: any) => t.status === 'active');

      if (activeTickets.length === 0) {
        errors.push(`Day ${day.dow} (Enabled) has no active tickets.`);
      }

      for (const t of activeTickets as any[]) {
        if (!t.name || !t.name.trim()) {
          errors.push(`A ticket on Day ${day.dow} is missing a name.`);
        }
        if (t.price_cents < 0) {
          errors.push(`Ticket "${t.name}" on Day ${day.dow} has invalid price.`);
        }
        if (t.inventory_limit !== null && t.inventory_limit < 0) {
          errors.push(`Ticket "${t.name}" on Day ${day.dow} has invalid inventory limit.`);
        }
      }
    }
  }

  if (!hasEnabledDay) {
    errors.push('At least one day must be enabled in the weekly schedule.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
