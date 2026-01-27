-- Verify migration 031 was applied successfully
-- Check if events.venue_id is now NULLABLE

SELECT 
  table_schema,
  table_name, 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'events' 
  AND column_name = 'venue_id';

-- Expected output:
-- is_nullable = 'YES' (previously was 'NO')
