-- 20260128183500_link_tickets_to_events_v2.sql
-- Fix Tickets FK relations for V2

-- 1. tickets -> events_v2 (Use NOT VALID to avoid breaking on old data)
ALTER TABLE public.tickets 
ADD CONSTRAINT tickets_events_v2_id_fkey 
FOREIGN KEY (event_id) REFERENCES public.events_v2(id) NOT VALID;

-- 2. tickets -> ticket_types_v2
ALTER TABLE public.tickets 
ADD CONSTRAINT tickets_ticket_types_v2_id_fkey 
FOREIGN KEY (ticket_type_id_v2) REFERENCES public.ticket_types_v2(id) NOT VALID;

-- 3. Validate constraints (Optional, might fail if data is bad, skip for now or try)
-- ALTER TABLE public.tickets VALIDATE CONSTRAINT tickets_events_v2_id_fkey;
