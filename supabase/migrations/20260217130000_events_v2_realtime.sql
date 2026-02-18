-- Add events_v2 to realtime publication for live event updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.events_v2;
